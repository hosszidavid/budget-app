import { IncomeForm } from "@/components/IncomeForm";
import { TransactionActions } from "@/components/TransactionActions";
import { requireUser } from "@/lib/auth";
import { buildCategoryPath } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export default async function EditIncomePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [income, people, categories] = await Promise.all([
    prisma.incomeEntry.findFirst({ where: { id, userId: user.id, deletedAt: null } }),
    prisma.person.findMany({ where: { userId: user.id, archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.categoryNode.findMany({ where: { userId: user.id, kind: "INCOME", archivedAt: null }, orderBy: { name: "asc" } }),
  ]);
  if (!income) notFound();
  const categoryOptions = categories.map(c => ({ id: c.id, path: buildCategoryPath(c.id, categories) }));

  return <main className="page">
    <div className="page-head"><div><div className="eyebrow">Előzmények</div><h1 className="page-title">Bevétel szerkesztése</h1><p className="muted">A kategória továbbra is kötelező, a megnevezés opcionális.</p></div></div>
    <IncomeForm
      people={people}
      categories={categoryOptions}
      initialIncome={{
        id: income.id,
        date: income.date.toISOString().slice(0, 10),
        personId: income.personId,
        categoryId: income.categoryId ?? "",
        label: income.label,
        amount: Number(income.amount),
        currency: income.currency,
        note: income.note ?? "",
      }}
    />
    <div className="danger-zone"><div><strong>Tranzakció törlése</strong><p className="muted">Soft delete: a rekord nem kerül bele a kimutatásokba.</p></div><TransactionActions type="income" id={income.id} /></div>
  </main>;
}
