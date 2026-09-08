import { getCurrentUser } from "@/lib/auth";
import { buildCategoryPath } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import { makeXlsx } from "@/lib/xlsx";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const url = new URL(request.url);
  const fromRaw=url.searchParams.get("from"),toRaw=url.searchParams.get("to");
  const from=fromRaw&&/^\d{4}-\d{2}-\d{2}$/.test(fromRaw)?new Date(`${fromRaw}T00:00:00.000Z`):new Date("2000-01-01T00:00:00.000Z");
  const to=toRaw&&/^\d{4}-\d{2}-\d{2}$/.test(toRaw)?new Date(`${toRaw}T23:59:59.999Z`):new Date("2100-01-01T00:00:00.000Z");
  const [categories,purchases,incomes]=await Promise.all([
    prisma.categoryNode.findMany({where:{userId:user.id}}),
    prisma.expensePurchase.findMany({where:{userId:user.id,deletedAt:null,date:{gte:from,lte:to}},include:{person:true,merchant:true,items:true},orderBy:{date:"asc"}}),
    prisma.incomeEntry.findMany({where:{userId:user.id,deletedAt:null,date:{gte:from,lte:to}},include:{person:true},orderBy:{date:"asc"}}),
  ]);
  const rows:Array<Array<string|number>>=[["date","type","person","merchant","label","category","amount","currency","base_amount_chf","note","receipt_id"]];
  for(const purchase of purchases){const rate=purchase.fxRate?Number(purchase.fxRate):null;for(const item of purchase.items)rows.push([purchase.date.toISOString().slice(0,10),"expense",purchase.person?.name||"Közös",purchase.merchant?.name||"",item.label,item.categoryId?buildCategoryPath(item.categoryId,categories):"",Number(item.amount),purchase.currency,rate?Number(item.amount)*rate:"",item.note||purchase.note||"",purchase.receiptId||""]);}
  for(const income of incomes)rows.push([income.date.toISOString().slice(0,10),"income",income.person?.name||"","",income.label,income.categoryId?buildCategoryPath(income.categoryId,categories):"",Number(income.amount),income.currency,income.baseAmount?Number(income.baseAmount):"",income.note||"",""]);
  const body=makeXlsx(rows);
  return new Response(body,{headers:{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":`attachment; filename="budget-transactions-${new Date().toISOString().slice(0,10)}.xlsx"`,"cache-control":"no-store"}});
}
