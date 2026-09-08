import { getCurrentUser } from "@/lib/auth";
import { applyAmountBehavior } from "@/lib/categories";
import { resolveFx } from "@/lib/fx";
import { prisma } from "@/lib/prisma";
import { attachReceiptImage, deleteIncomingReceiptImage, deleteReceiptImage } from "@/lib/receipt-image";
import { syncReceiptLedger } from "@/lib/receipt-ledger";
import { normalizeText } from "@/lib/text";
import { z } from "zod";

const componentSchema=z.object({rawLabel:z.string().min(1).max(500),label:z.string().min(1).max(180),amount:z.number().refine(v=>Number.isFinite(v)&&v!==0),reusableItemId:z.string().uuid().nullable().optional(),categoryId:z.string().uuid().nullable().optional(),categoryPath:z.string().max(500).optional(),source:z.enum(["MANUAL","AI","MAPPING"]).optional(),confidence:z.number().min(0).max(1).nullable().optional(),isDairy:z.boolean().optional(),containsEgg:z.boolean().optional(),containsAnimal:z.boolean().optional(),isAlcohol:z.boolean().optional(),isFrozen:z.boolean().optional(),isCanned:z.boolean().optional(),isPackaged:z.boolean().optional()});
const lineSchema = z.object({
  rawLabel:z.string().max(500).nullable().optional(), label:z.string().min(1).max(180), amount:z.number().refine(v => Number.isFinite(v) && v !== 0),
  reusableItemId:z.string().uuid().nullable().optional(), categoryId:z.string().uuid().nullable().optional(), note:z.string().max(1000).nullable().optional(),
  source:z.enum(["MANUAL","AI","MAPPING"]).optional(), aiConfidence:z.number().min(0).max(1).nullable().optional(), rememberMapping:z.boolean().optional(), mappingScope:z.enum(["merchant","global"]).optional(), components:z.array(componentSchema).max(50).optional(),
  isDairy:z.boolean().default(false), containsEgg:z.boolean().default(false), containsAnimal:z.boolean().default(false), isAlcohol:z.boolean().default(false), isFrozen:z.boolean().default(false), isCanned:z.boolean().default(false), isPackaged:z.boolean().default(false),
});
const structureActionSchema=z.object({action:z.enum(["MERGE","SPLIT"]),rawLabels:z.array(z.string().min(1).max(500)).min(2).max(50)});
const schema=z.object({
  action:z.enum(["draft","commit"]), date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/), personId:z.string().uuid().nullable().optional(), merchant:z.string().max(180).nullable().optional(), currency:z.string().length(3), declaredTotal:z.number().positive(), note:z.string().max(2000).nullable().optional(), lines:z.array(lineSchema).min(1).max(200), structureActions:z.array(structureActionSchema).max(200).optional(),
  imageToken:z.string().uuid().nullable().optional(), imageMimeType:z.string().max(80).nullable().optional(), imageOriginalName:z.string().max(255).nullable().optional(), aiModel:z.string().max(180).nullable().optional(),
});

export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();if(!user)return Response.json({error:"Nincs bejelentkezve."},{status:401});const {id}=await params;
  const current=await prisma.receipt.findFirst({where:{id,userId:user.id,status:"DRAFT"},include:{purchase:true}});if(!current)return Response.json({error:"Ez a blokk már le van zárva vagy nem található."},{status:404});
  const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:"Érvénytelen blokkadatok."},{status:400});const data=parsed.data;
  if(data.personId&&!await prisma.person.findFirst({where:{id:data.personId,userId:user.id,archivedAt:null}}))return Response.json({error:"Ismeretlen személy."},{status:400});
  const categoryIds=[...new Set(data.lines.flatMap(l=>[l.categoryId,...(l.components??[]).map(c=>c.categoryId)]).filter((v):v is string=>Boolean(v)))];
  const categoryRows=categoryIds.length?await prisma.categoryNode.findMany({where:{userId:user.id,kind:"EXPENSE",id:{in:categoryIds},archivedAt:null},select:{id:true,amountBehavior:true}}):[];if(categoryRows.length!==categoryIds.length)return Response.json({error:"Ismeretlen kategória."},{status:400});
  const behaviorByCategory=new Map(categoryRows.map(c=>[c.id,c.amountBehavior]));
  const effectiveLines=data.lines.map(line=>({...line,amount:applyAmountBehavior(line.amount,line.categoryId?behaviorByCategory.get(line.categoryId):"NORMAL")}));
  const processed=effectiveLines.reduce((s,l)=>s+l.amount,0),difference=data.declaredTotal-processed,unresolved=effectiveLines.filter(l=>!l.categoryId).length;
  if(data.action==="commit"&&unresolved>0)return Response.json({error:`${unresolved} tétel még nincs kategorizálva. A lezáráshoz minden tételt rendelj kategóriához.`},{status:409});
  const date=new Date(`${data.date}T12:00:00Z`),fx=await resolveFx(processed,data.currency,user.baseCurrency,date);
  const result=await prisma.$transaction(async tx=>{
    let merchantId:string|null=null,merchantNormalized="";
    if(data.merchant?.trim()){const name=data.merchant.trim();merchantNormalized=normalizeText(name);const m=await tx.merchant.upsert({where:{userId_normalized:{userId:user.id,normalized:merchantNormalized}},update:{name,archivedAt:null},create:{userId:user.id,name,normalized:merchantNormalized}});merchantId=m.id;}
    await tx.receipt.update({where:{id},data:{merchantId,personId:data.personId??null,purchaseDate:date,currency:data.currency.toUpperCase(),declaredTotal:data.declaredTotal,note:data.note?.trim()||null,status:data.action==="commit"?"SAVED":"DRAFT",aiModel:data.aiModel??current.aiModel,aiProcessedAt:data.aiModel?new Date():current.aiProcessedAt}});
    const purchaseId=await syncReceiptLedger({tx,userId:user.id,receiptId:id,purchaseId:current.purchase?.id??null,merchantId,merchantNormalized,personId:data.personId??null,date,currency:data.currency.toUpperCase(),note:data.note?.trim()||null,lines:effectiveLines,structureActions:data.structureActions??[],fx,finalize:data.action==="commit"});
    return {receiptId:id,purchaseId};
  });

  let imageRetained=Boolean(current.imageStorageKey);
  if(data.imageToken){
    try{
      if(data.action==="draft"){
        const oldKey=current.imageStorageKey;
        const key=await attachReceiptImage(user.id,id,data.imageToken);
        if(oldKey&&oldKey!==key)await deleteReceiptImage(oldKey,user.id);
        await prisma.receipt.update({where:{id},data:{imageStorageKey:key,imageMimeType:data.imageMimeType??null,imageOriginalName:data.imageOriginalName??null}});imageRetained=true;
      }else{
        await deleteIncomingReceiptImage(user.id,data.imageToken);
        if(current.imageStorageKey)await deleteReceiptImage(current.imageStorageKey,user.id);
        await prisma.receipt.update({where:{id},data:{imageStorageKey:null,imageMimeType:null,imageOriginalName:null}});imageRetained=false;
      }
    }catch(error){console.error("receipt image replace failed",error);}
  }else if(data.action==="commit"&&current.imageStorageKey){
    try{await deleteReceiptImage(current.imageStorageKey,user.id);await prisma.receipt.update({where:{id},data:{imageStorageKey:null,imageMimeType:null,imageOriginalName:null}});imageRetained=false;}catch(error){console.error("receipt image cleanup failed",error);}
  }
  return Response.json({ok:true,...result,difference,unresolved,reconciliation:Math.abs(difference)<=0.01?"match":"mismatch",fxStatus:fx?"ready":"pending",imageRetained});
}

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();if(!user)return Response.json({error:"Nincs bejelentkezve."},{status:401});const {id}=await params;
  const receipt=await prisma.receipt.findFirst({where:{id,userId:user.id,status:"DRAFT"},include:{purchase:true}});if(!receipt)return Response.json({error:"Csak piszkozat törölhető innen."},{status:409});
  await prisma.$transaction(async tx=>{if(receipt.purchase)await tx.expensePurchase.delete({where:{id:receipt.purchase.id}});await tx.receipt.delete({where:{id}})});
  await deleteReceiptImage(receipt.imageStorageKey,user.id).catch(()=>{});
  return Response.json({ok:true});
}
