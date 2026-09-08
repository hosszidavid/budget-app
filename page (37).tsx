import { ExpenseForm } from "@/components/ExpenseForm";
import { requireUser } from "@/lib/auth";
import { buildCategoryPath, rootColor } from "@/lib/categories";
import { ensureV02Defaults } from "@/lib/defaults";
import { prisma } from "@/lib/prisma";

export default async function AddExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ categoryId?: string; label?: string }>;
}) {
  const user = await requireUser();
  await ensureV02Defaults(prisma, user.id);
  const params = await searchParams;
  const [people, categories, merchants] = await Promise.all([
    prisma.person.findMany({ where: { userId: user.id, archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.categoryNode.findMany({ where: { userId: user.id, kind: "EXPENSE", archivedAt: null }, orderBy: [{ depth: "asc" }, { name: "asc" }] }),
    prisma.merchant.findMany({ where: { userId: user.id, archivedAt: null }, orderBy: { updatedAt: "desc" }, take: 30 }),
  ]);
  const categoryOptions = categories.map(c => ({ id: c.id, name: c.name, parentId: c.parentId, depth: c.depth, path: buildCategoryPath(c.id, categories), color: rootColor(c.id, categories), amountBehavior: c.amountBehavior }));
  const selected = params.categoryId ? categoryOptions.find(c => c.id === params.categoryId) : undefined;
  const initialItem = selected ? { label: params.label ?? selected.name, categoryId: selected.id, categoryPath: selected.path } : undefined;

  return <main className="page">
    <div className="page-head"><div><div className="eyebrow">Új bevitel</div><h1 className="page-title">Kiadás</h1><p className="muted">Egy vásárlás több tételből is állhat. A kategóriát nem kell fejben tartanod: elég a tételt keresni.</p></div></div>
    <ExpenseForm people={people} categories={categoryOptions} merchants={merchants} initialItem={initialItem} />
  </main>;
}
