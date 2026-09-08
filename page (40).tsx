import { PrintButton } from "@/components/PrintButton";
import { requireUser } from "@/lib/auth";
import { buildCategoryPath, rootColor } from "@/lib/categories";
import { formatMoney } from "@/lib/money";
import { parsePeriod } from "@/lib/period";
import { prisma } from "@/lib/prisma";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ mode?: string; year?: string; month?: string; from?: string; to?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const period = parsePeriod(params);
  const [categories, purchases, incomes] = await Promise.all([
    prisma.categoryNode.findMany({ where: { userId: user.id, kind: "EXPENSE" } }),
    prisma.expensePurchase.findMany({ where: { userId: user.id, deletedAt: null, date: { gte: period.start, lt: period.end } }, include: { items: true, person: true, merchant: true }, orderBy: { date: "asc" } }),
    prisma.incomeEntry.findMany({ where: { userId: user.id, deletedAt: null, date: { gte: period.start, lt: period.end } }, include: { person: true }, orderBy: { date: "asc" } }),
  ]);
  const byId = new Map(categories.map(c=>[c.id,c]));
  const categoryTotals = new Map<string,{name:string,color:string,amount:number}>();
  let expenseTotal=0,incomeTotal=0,missingFx=0;
  for (const purchase of purchases) {
    const rate = purchase.fxRate == null ? (purchase.currency===user.baseCurrency?1:null) : Number(purchase.fxRate);
    if (rate==null) { missingFx++; continue; }
    for (const item of purchase.items) {
      const amount=Number(item.amount)*rate; expenseTotal+=amount;
      let current=item.categoryId?byId.get(item.categoryId):null; let guard=0;
      while(current?.parentId&&byId.has(current.parentId)&&guard++<8) current=byId.get(current.parentId)!;
      const key=current?.id||"uncategorized"; const row=categoryTotals.get(key)||{name:current?.name||"Nincs kategorizálva",color:item.categoryId?rootColor(item.categoryId,categories):"#b9bec5",amount:0}; row.amount+=amount; categoryTotals.set(key,row);
    }
  }
  for (const income of incomes) { if (income.baseAmount==null) { missingFx++; continue; } incomeTotal+=Number(income.baseAmount); }
  const sorted=[...categoryTotals.values()].sort((a,b)=>b.amount-a.amount);
  return <main className="page report-page">
    <div className="report-toolbar no-print"><a className="secondary button-link" href="/app/settings">← Beállítások</a><form className="report-period-form" method="get"><select className="select" name="mode" defaultValue={period.mode}><option value="month">Hónap</option><option value="year">Év</option><option value="custom">Egyedi</option></select><input className="input" name="year" type="number" defaultValue={period.year}/><input className="input" name="month" type="number" min="1" max="12" defaultValue={period.month}/><button className="secondary">Frissítés</button></form><PrintButton/></div>
    <article className="print-report">
      <header><div className="eyebrow">Budget report</div><h1>{period.title}</h1><p>{period.subtitle} · alapvaluta {user.baseCurrency}</p></header>
      <div className="report-summary"><div><span>Kiadás</span><strong>{formatMoney(expenseTotal,user.baseCurrency)}</strong></div><div><span>Bevétel</span><strong>{formatMoney(incomeTotal,user.baseCurrency)}</strong></div><div><span>Nettó</span><strong>{formatMoney(incomeTotal-expenseTotal,user.baseCurrency)}</strong></div></div>
      {missingFx>0&&<div className="warning">{missingFx} rekord kimaradt a CHF összesítésből hiányzó árfolyam miatt.</div>}
      <section><h2>Kiadások kategóriánként</h2><table className="report-table"><thead><tr><th>Kategória</th><th>Összeg</th><th>Arány</th></tr></thead><tbody>{sorted.map(row=><tr key={row.name}><td><span className="report-dot" style={{background:row.color}}/>{row.name}</td><td>{formatMoney(row.amount,user.baseCurrency)}</td><td>{expenseTotal?`${(row.amount/expenseTotal*100).toFixed(1)}%`:"0%"}</td></tr>)}</tbody></table></section>
      <section><h2>Tranzakciók</h2><table className="report-table report-transactions"><thead><tr><th>Dátum</th><th>Típus</th><th>Tétel</th><th>Személy</th><th>Összeg</th></tr></thead><tbody>{purchases.flatMap(p=>p.items.map(i=><tr key={i.id}><td>{p.date.toISOString().slice(0,10)}</td><td>Kiadás</td><td>{i.label}<small>{i.categoryId?buildCategoryPath(i.categoryId,categories):""}</small></td><td>{p.person?.name||"Közös"}</td><td>{Number(i.amount).toFixed(2)} {p.currency}</td></tr>))}{incomes.map(i=><tr key={i.id}><td>{i.date.toISOString().slice(0,10)}</td><td>Bevétel</td><td>{i.label}</td><td>{i.person.name}</td><td>{Number(i.amount).toFixed(2)} {i.currency}</td></tr>)}</tbody></table></section>
      <footer>Generálva: {new Date().toLocaleString("hu-HU")} · Budget v0.14</footer>
    </article>
  </main>;
}
