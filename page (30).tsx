import { ExpenseForm } from "@/components/ExpenseForm";
import { TransactionActions } from "@/components/TransactionActions";
import { requireUser } from "@/lib/auth";
import { buildCategoryPath, rootColor } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [purchase, people, categories, merchants] = await Promise.all([
    prisma.expensePurchase.findFirst({
      where: { id, userId: user.id, deletedAt: null },
      include: { items: true, merchant: true },
    }),
    prisma.person.findMany({ where: { userId: user.id, archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.categoryNode.findMany({ where: { userId: user.id, kind: "EXPENSE", archivedAt: null }, orderBy: [{ depth: "asc" }, { name: "asc" }] }),
    prisma.merchant.findMany({ where: { userId: user.id, archivedAt: null }, orderBy: { updatedAt: "desc" }, take: 50 }),
  ]);
  if (!purchase) notFound();
  const categoryOptions = categories.map(c => ({ id: c.id, name: c.name, parentId: c.parentId, depth: c.depth, path: buildCategoryPath(c.id, categories), color: rootColor(c.id, categories), amountBehavior: c.amountBehavior }));
  const pathById = new Map(categoryOptions.map(c => [c.id, c.path]));

  return <main className="page">
    <div className="page-head"><div><div className="eyebrow">Előzmények</div><h1 className="page-title">Kiadás szerkesztése</h1><p className="muted">A módosítás azonnal bekerül az összesítésekbe.</p></div></div>
    <ExpenseForm
      people={people}
      categories={categoryOptions}
      merchants={merchants}
      initialPurchase={{
        id: purchase.id,
        date: purchase.date.toISOString().slice(0, 10),
        personId: purchase.personId,
        merchant: purchase.merchant?.name ?? "",
        currency: purchase.currency,
        note: purchase.note ?? "",
        items: purchase.items.map(item => ({
          id: item.id,
          label: item.label,
          amount: Number(item.amount),
          reusableItemId: item.reusableItemId,
          categoryId: item.categoryId,
          categoryPath: item.categoryId ? (pathById.get(item.categoryId) ?? "") : "",
          isDairy: item.isDairy,
          containsEgg: item.containsEgg,
          containsAnimal: item.containsAnimal,
          isAlcohol: item.isAlcohol,
          isFrozen: item.isFrozen,
          isCanned: item.isCanned,
          isPackaged: item.isPackaged,
          fuelLiters: item.fuelLiters == null ? null : Number(item.fuelLiters),
        })),
      }}
    />
    <div className="danger-zone"><div><strong>Tranzakció törlése</strong><p className="muted">Soft delete: a rekord nem kerül bele a kimutatásokba.</p></div><TransactionActions type="expense" id={purchase.id} /></div>
  </main>;
}
