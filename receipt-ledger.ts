import { structureSignature } from "./receipt-structure";
import { normalizeReceiptLabel, normalizeText } from "./text";

type ComponentInput = {
  rawLabel:string; label:string; amount:number; reusableItemId?:string|null; categoryId?:string|null; categoryPath?:string;
  source?:"MANUAL"|"AI"|"MAPPING"; confidence?:number|null;
  isDairy?:boolean; containsEgg?:boolean; containsAnimal?:boolean; isAlcohol?:boolean; isFrozen?:boolean; isCanned?:boolean; isPackaged?:boolean;
};

type LineInput = {
  rawLabel?: string | null; label:string; amount:number; reusableItemId?:string|null; categoryId?:string|null; note?:string|null;
  source?:"MANUAL"|"AI"|"MAPPING"; aiConfidence?:number|null; rememberMapping?:boolean; mappingScope?:"merchant"|"global";
  components?:ComponentInput[];
  isDairy:boolean; containsEgg:boolean; containsAnimal:boolean; isAlcohol:boolean; isFrozen:boolean; isCanned:boolean; isPackaged:boolean;
};

type StructureActionInput = { action:"MERGE"|"SPLIT"; rawLabels:string[] };

type SaveArgs = {
  tx:any; userId:string; receiptId:string; purchaseId:string|null; merchantId:string|null; merchantNormalized:string;
  personId:string|null; date:Date; currency:string; note:string|null; lines:LineInput[]; structureActions?:StructureActionInput[];
  fx:{rate:number;date:Date;source:string;baseAmount:number}|null; finalize:boolean;
};

function componentRawLabels(line:LineInput) {
  if (line.components?.length) return line.components.map(c=>c.rawLabel).filter(Boolean);
  return line.rawLabel?.trim() ? line.rawLabel.split(" + ").map(v=>v.trim()).filter(Boolean) : [];
}

export async function syncReceiptLedger(args:SaveArgs) {
  const {tx,userId,receiptId,merchantId,merchantNormalized,personId,date,currency,note,lines,fx,finalize}=args;
  let purchaseId=args.purchaseId;
  if (purchaseId) {
    await tx.expenseItem.deleteMany({where:{purchaseId}});
    await tx.expensePurchase.update({where:{id:purchaseId},data:{date,currency,note,personId,merchantId,fxRate:fx?.rate??null,fxDate:fx?.date??null,fxSource:fx?.source??"pending",baseAmount:fx?.baseAmount??null,deletedAt:null}});
  } else {
    const purchase=await tx.expensePurchase.create({data:{userId,date,currency,note,source:"RECEIPT",personId,merchantId,receiptId,fxRate:fx?.rate??null,fxDate:fx?.date??null,fxSource:fx?.source??"pending",baseAmount:fx?.baseAmount??null}});
    purchaseId=purchase.id;
  }

  await tx.receiptLine.deleteMany({where:{receiptId}});
  for (const line of lines) {
    let categoryId=line.categoryId??null;
    let reusableItemId=line.reusableItemId??null;
    if (reusableItemId) {
      const existing=await tx.reusableItem.findFirst({where:{id:reusableItemId,userId,kind:"EXPENSE"}});
      if (existing) categoryId=categoryId??existing.categoryId;
      else reusableItemId=null;
    }

    if (finalize) {
      if (!reusableItemId) {
        const normalized=normalizeText(line.label);
        const reusable=await tx.reusableItem.upsert({
          where:{userId_kind_normalized:{userId,kind:"EXPENSE",normalized}},
          update:{name:line.label.trim(),categoryId:categoryId??undefined,usageCount:{increment:1},lastUsedAt:new Date(),archivedAt:null,isDairy:line.isDairy,containsEgg:line.containsEgg,containsAnimal:line.containsAnimal,isAlcohol:line.isAlcohol,isFrozen:line.isFrozen,isCanned:line.isCanned,isPackaged:line.isPackaged},
          create:{userId,kind:"EXPENSE",name:line.label.trim(),normalized,categoryId,usageCount:1,lastUsedAt:new Date(),isDairy:line.isDairy,containsEgg:line.containsEgg,containsAnimal:line.containsAnimal,isAlcohol:line.isAlcohol,isFrozen:line.isFrozen,isCanned:line.isCanned,isPackaged:line.isPackaged},
        });
        reusableItemId=reusable.id; categoryId=categoryId??reusable.categoryId;
      } else {
        await tx.reusableItem.update({where:{id:reusableItemId},data:{categoryId:categoryId??undefined,usageCount:{increment:1},lastUsedAt:new Date(),archivedAt:null,isDairy:line.isDairy,containsEgg:line.containsEgg,containsAnimal:line.containsAnimal,isAlcohol:line.isAlcohol,isFrozen:line.isFrozen,isCanned:line.isCanned,isPackaged:line.isPackaged}});
      }
    }

    const persistedComponents=(line.components?.length ? line.components : []).map(c=>({
      rawLabel:c.rawLabel,label:c.label,amount:Number(c.amount),reusableItemId:c.reusableItemId??null,categoryId:c.categoryId??null,categoryPath:c.categoryPath??"",source:c.source??"MANUAL",confidence:c.confidence??null,
      isDairy:!!c.isDairy,containsEgg:!!c.containsEgg,containsAnimal:!!c.containsAnimal,isAlcohol:!!c.isAlcohol,isFrozen:!!c.isFrozen,isCanned:!!c.isCanned,isPackaged:!!c.isPackaged,
    }));
    await tx.receiptLine.create({data:{receiptId,rawLabel:line.rawLabel?.trim()||null,label:line.label.trim(),amount:line.amount,reusableItemId,categoryId,note:line.note?.trim()||null,source:line.source??"MANUAL",aiConfidence:line.aiConfidence??null,isDairy:line.isDairy,containsEgg:line.containsEgg,containsAnimal:line.containsAnimal,isAlcohol:line.isAlcohol,isFrozen:line.isFrozen,isCanned:line.isCanned,isPackaged:line.isPackaged,components:persistedComponents.length>1?persistedComponents:undefined}});
    await tx.expenseItem.create({data:{purchaseId,reusableItemId,categoryId,label:line.label.trim(),amount:line.amount,note:line.note?.trim()||null,isDairy:line.isDairy,containsEgg:line.containsEgg,containsAnimal:line.containsAnimal,isAlcohol:line.isAlcohol,isFrozen:line.isFrozen,isCanned:line.isCanned,isPackaged:line.isPackaged}});

    if ((finalize || line.rememberMapping) && line.rawLabel?.trim()) {
      const scopes = line.mappingScope === "global" ? ["*"] : merchantNormalized ? [merchantNormalized] : ["*"];
      const rawParts=[...new Set(componentRawLabels(line).flatMap(v=>[normalizeText(v),normalizeReceiptLabel(v)]).filter(Boolean))];
      for (const mappingMerchant of scopes) for (const rawNormalized of rawParts) {
        await tx.receiptMapping.upsert({
          where:{userId_merchantNormalized_rawNormalized:{userId,merchantNormalized:mappingMerchant,rawNormalized}},
          update:{label:line.label.trim(),reusableItemId,categoryId,isDairy:line.isDairy,containsEgg:line.containsEgg,containsAnimal:line.containsAnimal,isAlcohol:line.isAlcohol,isFrozen:line.isFrozen,isCanned:line.isCanned,isPackaged:line.isPackaged,usageCount:{increment:1},lastUsedAt:new Date()},
          create:{userId,merchantNormalized:mappingMerchant,rawNormalized,label:line.label.trim(),reusableItemId,categoryId,isDairy:line.isDairy,containsEgg:line.containsEgg,containsAnimal:line.containsAnimal,isAlcohol:line.isAlcohol,isFrozen:line.isFrozen,isCanned:line.isCanned,isPackaged:line.isPackaged,usageCount:1,lastUsedAt:new Date()},
        });
      }
    }
  }

  // Structural corrections are learned on draft save as well. Unique signature + upsert
  // means the latest SPLIT/MERGE decision becomes the active rule.
  for (const action of args.structureActions ?? []) {
    const rawLabels=action.rawLabels.map(v=>v.trim()).filter(Boolean);
    if(rawLabels.length<2) continue;
    const signature=structureSignature(rawLabels);
    if(!signature) continue;
    const targetLine=action.action==="MERGE" ? lines.find(line=>structureSignature(componentRawLabels(line))===signature) : undefined;
    await tx.receiptStructureRule.upsert({
      where:{userId_merchantNormalized_signature:{userId,merchantNormalized:merchantNormalized||"*",signature}},
      update:{action:action.action,components:rawLabels,targetLabel:targetLine?.label.trim()||null,targetReusableItemId:targetLine?.reusableItemId??null,targetCategoryId:targetLine?.categoryId??null,usageCount:{increment:1},lastUsedAt:new Date()},
      create:{userId,merchantNormalized:merchantNormalized||"*",signature,action:action.action,components:rawLabels,targetLabel:targetLine?.label.trim()||null,targetReusableItemId:targetLine?.reusableItemId??null,targetCategoryId:targetLine?.categoryId??null,usageCount:1,lastUsedAt:new Date()},
    });
  }
  return purchaseId!;
}
