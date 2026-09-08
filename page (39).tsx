import { ReceiptForm } from "@/components/ReceiptForm";
import { requireUser } from "@/lib/auth";
import { buildCategoryPath, rootColor } from "@/lib/categories";
import { ensureV02Defaults } from "@/lib/defaults";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export default async function AddReceiptPage({searchParams}:{searchParams:Promise<{id?:string}>}){
 const user=await requireUser(); await ensureV02Defaults(prisma,user.id); const sp=await searchParams;
 const [people,categories,merchants,receipt]=await Promise.all([
  prisma.person.findMany({where:{userId:user.id,archivedAt:null},orderBy:{name:"asc"},select:{id:true,name:true}}),
  prisma.categoryNode.findMany({where:{userId:user.id,kind:"EXPENSE",archivedAt:null},orderBy:[{depth:"asc"},{name:"asc"}]}),
  prisma.merchant.findMany({where:{userId:user.id,archivedAt:null},orderBy:{updatedAt:"desc"},take:50,select:{id:true,name:true}}),
  sp.id?prisma.receipt.findFirst({where:{id:sp.id,userId:user.id,status:"DRAFT"},include:{merchant:true,lines:true}}):Promise.resolve(null),
 ]);
 if(sp.id&&!receipt)notFound();
 const categoryOptions=categories.map(c=>({id:c.id,name:c.name,parentId:c.parentId,depth:c.depth,path:buildCategoryPath(c.id,categories),color:rootColor(c.id,categories),amountBehavior:c.amountBehavior})); const pathById=new Map(categoryOptions.map(c=>[c.id,c.path]));
 const aiTimeoutSeconds=Math.round(Math.max(10_000,Math.min(600_000,Number(process.env.RECEIPT_AI_TIMEOUT_MS||240_000)))/1000);
 return <main className="page"><div className="page-head"><div><div className="eyebrow">AI Receipt Engine</div><h1 className="page-title">{receipt?"Blokk piszkozat":"Blokk hozzáadása"}</h1><p className="muted">Fotózd le a blokkot, ellenőrizd az AI által előtöltött adatokat, majd mentsd piszkozatként vagy zárd le.</p></div><a className="secondary" href="/app/receipts">Blokkok ›</a></div><ReceiptForm people={people} categories={categoryOptions} merchants={merchants} aiTimeoutSeconds={aiTimeoutSeconds} initialReceipt={receipt?{id:receipt.id,date:(receipt.purchaseDate??receipt.createdAt).toISOString().slice(0,10),personId:receipt.personId,merchant:receipt.merchant?.name??"",currency:receipt.currency??"CHF",declaredTotal:Number(receipt.declaredTotal??0),note:receipt.note??"",status:receipt.status,hasImage:Boolean(receipt.imageStorageKey),aiModel:receipt.aiModel,lines:receipt.lines.map(l=>({id:l.id,rawLabel:l.rawLabel??"",label:l.label,amount:Number(l.amount),reusableItemId:l.reusableItemId,categoryId:l.categoryId,categoryPath:l.categoryId?(pathById.get(l.categoryId)??""):"",note:l.note??"",source:l.source,aiConfidence:l.aiConfidence==null?null:Number(l.aiConfidence),isDairy:l.isDairy,containsEgg:l.containsEgg,containsAnimal:l.containsAnimal,isAlcohol:l.isAlcohol,isFrozen:l.isFrozen,isCanned:l.isCanned,isPackaged:l.isPackaged,components:Array.isArray(l.components)?(l.components as any[]).map(c=>({...c,categoryPath:c.categoryId?(pathById.get(c.categoryId)??c.categoryPath??""):c.categoryPath??""})):[]}))}:undefined}/></main>
}
