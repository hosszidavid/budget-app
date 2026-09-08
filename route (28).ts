import { getCurrentUser } from "@/lib/auth";
import { applyAmountBehavior } from "@/lib/categories";
import { resolveFx } from "@/lib/fx";
import { normalizeText } from "@/lib/text";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const itemSchema = z.object({
  label:z.string().min(1).max(180), amount:z.number().refine(v => Number.isFinite(v) && v !== 0), reusableItemId:z.string().uuid().nullable().optional(), categoryId:z.string().uuid().nullable().optional(),
  isDairy:z.boolean().default(false), containsEgg:z.boolean().default(false), containsAnimal:z.boolean().default(false), isAlcohol:z.boolean().default(false), isFrozen:z.boolean().default(false), isCanned:z.boolean().default(false), isPackaged:z.boolean().default(false), fuelLiters:z.number().refine(v => Number.isFinite(v) && v !== 0).nullable().optional()
});
const schema = z.object({ date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/), personId:z.string().uuid().nullable().optional(), merchant:z.string().max(180).nullable().optional(), currency:z.string().length(3), note:z.string().max(2000).nullable().optional(), items:z.array(itemSchema).min(1).max(100) });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return Response.json({error:"Érvénytelen kiadási adatok."},{status:400});
  const data = parsed.data;
  if (data.items.some(item => !item.categoryId)) return Response.json({ error: "Minden kézi kiadási tételhez kötelező kategóriát választani." }, { status: 400 });

  if (data.personId && !await prisma.person.findFirst({ where: { id: data.personId, userId: user.id, archivedAt: null } })) return Response.json({ error: "Ismeretlen személy." }, { status: 400 });
  const requestedCategoryIds = [...new Set(data.items.map(i => i.categoryId).filter((v): v is string => Boolean(v)))];
  const categoryRows = requestedCategoryIds.length ? await prisma.categoryNode.findMany({ where: { userId: user.id, kind: "EXPENSE", id: { in: requestedCategoryIds }, archivedAt: null }, select:{ id:true, amountBehavior:true } }) : [];
  if (categoryRows.length !== requestedCategoryIds.length) return Response.json({ error: "Ismeretlen kategória." }, { status: 400 });
  const behaviorByCategory = new Map(categoryRows.map(c => [c.id, c.amountBehavior]));
  const effectiveItems = data.items.map(item => ({ ...item, amount: applyAmountBehavior(item.amount, item.categoryId ? behaviorByCategory.get(item.categoryId) : "NORMAL") }));

  const txDate = new Date(`${data.date}T12:00:00Z`);
  const total = effectiveItems.reduce((sum, item) => sum + item.amount, 0);
  const fx = await resolveFx(total, data.currency, user.baseCurrency, txDate);

  const purchase = await prisma.$transaction(async tx => {
    let merchantId: string | null = null;
    if (data.merchant?.trim()) {
      const name = data.merchant.trim(); const normalized = normalizeText(name);
      const merchant = await tx.merchant.upsert({ where:{userId_normalized:{userId:user.id,normalized}}, update:{name}, create:{userId:user.id,name,normalized} });
      merchantId = merchant.id;
    }
    const p = await tx.expensePurchase.create({ data:{
      userId:user.id, date:txDate, personId:data.personId??null, merchantId, currency:data.currency.toUpperCase(), note:data.note?.trim()||null,
      fxRate:fx?.rate??null, fxDate:fx?.date??null, fxSource:fx?.source??"pending", baseAmount:fx?.baseAmount??null,
    } });
    for (const item of effectiveItems) {
      let reusableItemId = item.reusableItemId ?? null;
      let categoryId = item.categoryId ?? null;
      if (reusableItemId) {
        const existing = await tx.reusableItem.findFirst({where:{id:reusableItemId,userId:user.id,kind:"EXPENSE"}});
        if (existing) categoryId = categoryId ?? existing.categoryId; else reusableItemId = null;
      }
      if (!reusableItemId) {
        const normalized = normalizeText(item.label);
        const reusable = await tx.reusableItem.upsert({
          where:{userId_kind_normalized:{userId:user.id,kind:"EXPENSE",normalized}},
          update:{name:item.label.trim(),categoryId:categoryId??undefined,lastUsedAt:new Date(),usageCount:{increment:1},isDairy:item.isDairy,containsEgg:item.containsEgg,containsAnimal:item.containsAnimal,isAlcohol:item.isAlcohol,isFrozen:item.isFrozen,isCanned:item.isCanned,isPackaged:item.isPackaged},
          create:{userId:user.id,kind:"EXPENSE",name:item.label.trim(),normalized,categoryId,usageCount:1,lastUsedAt:new Date(),isDairy:item.isDairy,containsEgg:item.containsEgg,containsAnimal:item.containsAnimal,isAlcohol:item.isAlcohol,isFrozen:item.isFrozen,isCanned:item.isCanned,isPackaged:item.isPackaged}
        });
        reusableItemId = reusable.id; categoryId = categoryId ?? reusable.categoryId;
      } else {
        await tx.reusableItem.update({where:{id:reusableItemId},data:{categoryId:categoryId??undefined,usageCount:{increment:1},lastUsedAt:new Date(),isDairy:item.isDairy,containsEgg:item.containsEgg,containsAnimal:item.containsAnimal,isAlcohol:item.isAlcohol,isFrozen:item.isFrozen,isCanned:item.isCanned,isPackaged:item.isPackaged}});
      }
      await tx.expenseItem.create({ data:{ purchaseId:p.id,reusableItemId,categoryId,label:item.label.trim(),amount:item.amount,isDairy:item.isDairy,containsEgg:item.containsEgg,containsAnimal:item.containsAnimal,isAlcohol:item.isAlcohol,isFrozen:item.isFrozen,isCanned:item.isCanned,isPackaged:item.isPackaged,fuelLiters:item.fuelLiters??null } });
    }
    return p;
  });
  return Response.json({ok:true,id:purchase.id,fxStatus:fx?"ready":"pending"});
}
