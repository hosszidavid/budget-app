import { getCurrentUser } from "@/lib/auth";
import { applyAmountBehavior } from "@/lib/categories";
import { resolveFx } from "@/lib/fx";
import { prisma } from "@/lib/prisma";
import { attachReceiptImage, deleteIncomingReceiptImage } from "@/lib/receipt-image";
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

async function validateOwnership(userId:string,data:z.infer<typeof schema>){
  if(data.personId&&!await prisma.person.findFirst({where:{id:data.personId,userId,archivedAt:null}}))return "Ismeretlen személy.";
  const ids=[...new Set(data.lines.flatMap(l=>[l.categoryId,...(l.components??[]).map(c=>c.categoryId)]).filter((v):v is string=>Boolean(v)))];
  if(ids.length){const count=await prisma.categoryNode.count({where:{userId,kind:"EXPENSE",id:{in:ids},archivedAt:null}});if(count!==ids.length)return "Ismeretlen kategória.";}
  return null;
}

export async function POST(request:Request){
  const user=await getCurrentUser(); if(!user)return Response.json({error:"Nincs bejelentkezve."},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null)); if(!parsed.success)return Response.json({error:"Érvénytelen blokkadatok."},{status:400});
  const data=parsed.data; const ownershipError=await validateOwnership(user.id,data); if(ownershipError)return Response.json({error:ownershipError},{status:400});
  const categoryIds=[...new Set(data.lines.flatMap(l=>[l.categoryId,...(l.components??[]).map(c=>c.categoryId)]).filter((v):v is string=>Boolean(v)))];
  const categoryRows=categoryIds.length?await prisma.categoryNode.findMany({where:{userId:user.id,kind:"EXPENSE",id:{in:categoryIds},archivedAt:null},select:{id:true,amountBehavior:true}}):[];
  const behaviorByCategory=new Map(categoryRows.map(c=>[c.id,c.amountBehavior]));
  const effectiveLines=data.lines.map(line=>({...line,amount:applyAmountBehavior(line.amount,line.categoryId?behaviorByCategory.get(line.categoryId):"NORMAL")}));
  const processedTotal=effectiveLines.reduce((s,l)=>s+l.amount,0); const difference=data.declaredTotal-processedTotal; const unresolved=effectiveLines.filter(l=>!l.categoryId).length;
  if(data.action==="commit"&&unresolved>0)return Response.json({error:`${unresolved} tétel még nincs kategorizálva. A lezáráshoz minden tételt rendelj kategóriához.`},{status:409});
  const date=new Date(`${data.date}T12:00:00Z`); const fx=await resolveFx(processedTotal,data.currency,user.baseCurrency,date);
  let imageStorageKey:string|null=null;
  const result=await prisma.$transaction(async tx=>{
    let merchantId:string|null=null,merchantNormalized="";
    if(data.merchant?.trim()){const name=data.merchant.trim();merchantNormalized=normalizeText(name);const m=await tx.merchant.upsert({where:{userId_normalized:{userId:user.id,normalized:merchantNormalized}},update:{name,archivedAt:null},create:{userId:user.id,name,normalized:merchantNormalized}});merchantId=m.id;}
    const receipt=await tx.receipt.create({data:{userId:user.id,merchantId,personId:data.personId??null,purchaseDate:date,currency:data.currency.toUpperCase(),declaredTotal:data.declaredTotal,note:data.note?.trim()||null,status:data.action==="commit"?"SAVED":"DRAFT",imageMimeType:data.action==="draft"?data.imageMimeType??null:null,imageOriginalName:data.action==="draft"?data.imageOriginalName??null:null,aiModel:data.aiModel??null,aiProcessedAt:data.aiModel?new Date():null}});
    const purchaseId=await syncReceiptLedger({tx,userId:user.id,receiptId:receipt.id,purchaseId:null,merchantId,merchantNormalized,personId:data.personId??null,date,currency:data.currency.toUpperCase(),note:data.note?.trim()||null,lines:effectiveLines,structureActions:data.structureActions??[],fx,finalize:data.action==="commit"});
    return {receiptId:receipt.id,purchaseId};
  });

  if(data.imageToken){
    try{
      if(data.action==="draft"){
        imageStorageKey=await attachReceiptImage(user.id,result.receiptId,data.imageToken);
        await prisma.receipt.update({where:{id:result.receiptId},data:{imageStorageKey}});
      }else await deleteIncomingReceiptImage(user.id,data.imageToken);
    }catch(error){console.error("receipt image attach cleanup failed",error);}
  }
  return Response.json({ok:true,...result,difference,unresolved,reconciliation:Math.abs(difference)<=0.01?"match":"mismatch",fxStatus:fx?"ready":"pending",imageRetained:Boolean(imageStorageKey)});
}
