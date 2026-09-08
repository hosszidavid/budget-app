import { prisma } from "@/lib/prisma";

export function monthBounds(year: number, month: number) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)),
    end: new Date(Date.UTC(year, month, 1, 0, 0, 0)),
    closingDate: new Date(Date.UTC(year, month, 0, 12, 0, 0)),
  };
}

export async function monthBaseFlow(userId: string, year: number, month: number) {
  const { start, end } = monthBounds(year, month);
  const [expenses, incomes] = await Promise.all([
    prisma.expensePurchase.findMany({ where: { userId, deletedAt: null, date: { gte: start, lt: end } }, select: { baseAmount: true } }),
    prisma.incomeEntry.findMany({ where: { userId, deletedAt: null, date: { gte: start, lt: end } }, select: { baseAmount: true } }),
  ]);
  const expenseBase = expenses.reduce((sum, x) => sum + Number(x.baseAmount ?? 0), 0);
  const incomeBase = incomes.reduce((sum, x) => sum + Number(x.baseAmount ?? 0), 0);
  const missingFx = expenses.filter(x => x.baseAmount == null).length + incomes.filter(x => x.baseAmount == null).length;
  return { expenseBase, incomeBase, netBase: incomeBase - expenseBase, missingFx };
}

export async function previousClosing(userId: string, year: number, month: number) {
  const prev = new Date(Date.UTC(year, month - 2, 1));
  const snapshot = await prisma.monthSnapshot.findUnique({
    where: { userId_year_month: { userId, year: prev.getUTCFullYear(), month: prev.getUTCMonth() + 1 } },
    include: { entries: true },
  });
  if (!snapshot?.closedAt) return null;
  const actual = snapshot.entries.reduce((sum, row) => sum + Number(row.baseAmount ?? 0), 0);
  const missingFx = snapshot.entries.some(row => row.baseAmount == null);
  return { snapshot, actual, missingFx };
}
