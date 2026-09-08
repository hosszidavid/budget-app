import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";

export default async function HistoryPage() {
  const user = await requireUser();
  const [purchases, incomes] = await Promise.all([
    prisma.expensePurchase.findMany({ where: { userId: user.id, deletedAt: null }, include: { items: true, merchant: true, person: true }, orderBy: { date: "desc" }, take: 100 }),
    prisma.incomeEntry.findMany({ where: { userId: user.id, deletedAt: null }, include: { person: true, category: true }, orderBy: { date: "desc" }, take: 100 }),
  ]);
  const rows = [
    ...purchases.map(p => ({ id: p.id, href: `/app/history/expense/${p.id}`, date: p.date, type: "Kiadás", title: p.merchant?.name ?? (p.items[0]?.label || "Kiadás"), sub: `${p.items.length} tétel · ${p.person?.name ?? "Közös"}`, amount: -p.items.reduce((s, i) => s + Number(i.amount), 0), currency: p.currency })),
    ...incomes.map(i => ({ id: i.id, href: `/app/history/income/${i.id}`, date: i.date, type: "Bevétel", title: i.label, sub: `${i.person.name}${i.category ? ` · ${i.category.name}` : ""}`, amount: Number(i.amount), currency: i.currency })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return <main className="page">
    <div className="page-head"><div><div className="eyebrow">Pénzmozgások</div><h1 className="page-title">Előzmények</h1><p className="muted">Kattints egy rekordra a szerkesztéshez vagy törléshez.</p></div></div>
    <div className="history-list">{rows.map(r => <Link className="history-card history-link" href={r.href} key={`${r.type}-${r.id}`}>
      <div className={`history-icon ${r.amount < 0 ? "expense" : "income"}`}>{r.amount < 0 ? "−" : "+"}</div>
      <div className="history-main"><strong>{r.title}</strong><small>{r.date.toLocaleDateString("hu-HU")} · {r.type} · {r.sub}</small></div>
      <div className={`history-amount ${r.amount < 0 ? "negative" : "positive"}`}>{r.amount < 0 ? "−" : "+"}{formatMoney(Math.abs(r.amount), r.currency)}</div>
      <span className="history-chevron">›</span>
    </Link>)}</div>
  </main>;
}
