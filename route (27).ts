import { getCurrentUser } from "@/lib/auth";
import { resolveFx } from "@/lib/fx";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({ year: z.number().int().min(2000).max(2200).optional(), month: z.number().int().min(1).max(12).optional() });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Érvénytelen időszak." }, { status: 400 });
  const { year, month } = parsed.data;
  let dateFilter = {};
  if (year && month) dateFilter = { date: { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) } };
  else if (year) dateFilter = { date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } };

  const [expenses, incomes] = await Promise.all([
    prisma.expensePurchase.findMany({ where: { userId: user.id, deletedAt: null, baseAmount: null, ...dateFilter }, include: { items: true } }),
    prisma.incomeEntry.findMany({ where: { userId: user.id, deletedAt: null, baseAmount: null, ...dateFilter } }),
  ]);
  let updated = 0;
  let pending = 0;
  for (const row of expenses) {
    const amount = row.items.reduce((sum, item) => sum + Number(item.amount), 0);
    const fx = await resolveFx(amount, row.currency, user.baseCurrency, row.date);
    if (!fx) { pending++; continue; }
    await prisma.expensePurchase.update({ where: { id: row.id }, data: { fxRate: fx.rate, fxDate: fx.date, fxSource: fx.source, baseAmount: fx.baseAmount } });
    updated++;
  }
  for (const row of incomes) {
    const fx = await resolveFx(Number(row.amount), row.currency, user.baseCurrency, row.date);
    if (!fx) { pending++; continue; }
    await prisma.incomeEntry.update({ where: { id: row.id }, data: { fxRate: fx.rate, fxDate: fx.date, fxSource: fx.source, baseAmount: fx.baseAmount } });
    updated++;
  }
  return Response.json({ ok: true, updated, pending });
}
