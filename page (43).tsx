import { AnalyticsView } from "@/components/AnalyticsView";
import { PeriodNavigator } from "@/components/PeriodNavigator";
import { requireUser } from "@/lib/auth";
import { buildCategoryPath, rootColor } from "@/lib/categories";
import { parsePeriod } from "@/lib/period";
import { prisma } from "@/lib/prisma";

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ mode?: string; year?: string; month?: string; from?: string; to?: string }> }) {
  const user = await requireUser();
  const period = parsePeriod(await searchParams);
  const [purchases, incomes, categories, people] = await Promise.all([
    prisma.expensePurchase.findMany({
      where: { userId: user.id, deletedAt: null, date: { gte: period.start, lt: period.end } },
      include: { items: true, person: true, merchant: true },
      orderBy: { date: "asc" },
    }),
    prisma.incomeEntry.findMany({
      where: { userId: user.id, deletedAt: null, date: { gte: period.start, lt: period.end } },
      include: { person: true },
      orderBy: { date: "asc" },
    }),
    prisma.categoryNode.findMany({ where: { userId: user.id, kind: "EXPENSE", archivedAt: null }, orderBy: [{ depth: "asc" }, { name: "asc" }] }),
    prisma.person.findMany({ where: { userId: user.id, archivedAt: null }, orderBy: { name: "asc" }, select: { name: true } }),
  ]);

  const byId = new Map(categories.map(c => [c.id, c]));
  function root(categoryId: string | null) {
    if (!categoryId || !byId.has(categoryId)) return { id: "uncategorized", name: "Nincs kategorizálva", path: "Nincs kategorizálva", color: "#b9bec5" };
    let current = byId.get(categoryId)!;
    let guard = 0;
    while (current.parentId && byId.has(current.parentId) && guard++ < 8) current = byId.get(current.parentId)!;
    return { id: current.id, name: current.name, path: buildCategoryPath(categoryId, categories), color: rootColor(categoryId, categories) };
  }

  let missingFx = 0;
  const expenseEvents: Array<{ date: string; amount: number; label: string; merchant: string; person: string; categoryId: string; categoryName: string; categoryPath: string; categoryColor: string }> = [];
  for (const purchase of purchases) {
    const rate = purchase.fxRate == null ? (purchase.currency === user.baseCurrency ? 1 : null) : Number(purchase.fxRate);
    if (rate == null) { missingFx += 1; continue; }
    for (const item of purchase.items) {
      const category = root(item.categoryId);
      expenseEvents.push({
        date: purchase.date.toISOString().slice(0, 10),
        amount: Number(item.amount) * rate,
        label: item.label,
        merchant: purchase.merchant?.name ?? "",
        person: purchase.person?.name ?? "Közös",
        categoryId: category.id,
        categoryName: category.name,
        categoryPath: category.path,
        categoryColor: category.color,
      });
    }
  }

  const incomeEvents: Array<{ date: string; amount: number; person: string; label: string }> = [];
  for (const income of incomes) {
    if (income.baseAmount == null) { missingFx += 1; continue; }
    incomeEvents.push({ date: income.date.toISOString().slice(0, 10), amount: Number(income.baseAmount), person: income.person.name, label: income.label });
  }

  return <main className="page analytics-page">
    <div className="dashboard-head">
      <div><div className="eyebrow">Analitika</div><h1 className="page-title">{period.title}</h1><p className="muted">Grafikonok, naptár és részletes kategóriaelemzés CHF-alapon.</p></div>
      <PeriodNavigator basePath="/app/analytics" mode={period.mode} year={period.year} month={period.month} from={period.from} to={period.to} />
    </div>
    <AnalyticsView expenses={expenseEvents} incomes={incomeEvents} people={people.map(p => p.name)} mode={period.mode} year={period.year} month={period.month} baseCurrency={user.baseCurrency} missingFx={missingFx} />
  </main>;
}
