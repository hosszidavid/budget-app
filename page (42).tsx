import { CategoryBreakdown } from "@/components/CategoryBreakdown";
import { FxBackfillButton } from "@/components/FxBackfillButton";
import { PeriodNavigator } from "@/components/PeriodNavigator";
import { requireUser } from "@/lib/auth";
import { rootColor } from "@/lib/categories";
import { formatMoney } from "@/lib/money";
import { parsePeriod } from "@/lib/period";
import { prisma } from "@/lib/prisma";

type Totals = Map<string, number>;
function addTotal(map: Totals, currency: string, value: number) { map.set(currency, (map.get(currency) ?? 0) + value); }
function entries(map?: Totals) { return [...(map ?? new Map()).entries()].sort(([a], [b]) => a.localeCompare(b)); }

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ mode?: string; year?: string; month?: string; from?: string; to?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const period = parsePeriod(sp);

  const [purchases, incomes, categories, people, snapshot] = await Promise.all([
    prisma.expensePurchase.findMany({ where: { userId:user.id, date:{gte:period.start,lt:period.end}, deletedAt:null }, include:{items:true,person:true,merchant:true}, orderBy:{date:"desc"} }),
    prisma.incomeEntry.findMany({ where: { userId:user.id, date:{gte:period.start,lt:period.end}, deletedAt:null }, include:{person:true,category:true}, orderBy:{date:"desc"} }),
    prisma.categoryNode.findMany({ where:{userId:user.id,kind:"EXPENSE",archivedAt:null}, orderBy:[{depth:"asc"},{name:"asc"}] }),
    prisma.person.findMany({ where:{userId:user.id,archivedAt:null}, orderBy:{name:"asc"} }),
    period.mode === "month" ? prisma.monthSnapshot.findUnique({ where:{userId_year_month:{userId:user.id,year:period.year,month:period.month}}, include:{entries:true} }) : Promise.resolve(null),
  ]);

  const expenseTotals: Totals = new Map();
  const incomeTotals: Totals = new Map();
  const personExpense = new Map<string, Totals>();
  const personExpenseBase = new Map<string, number>();
  const categoryTotals = new Map<string, Totals>();
  const uncategorized: Totals = new Map();
  const categoryById = new Map(categories.map(c => [c.id, c]));
  let expenseBase = 0, incomeBase = 0, missingFx = 0;

  function addCategoryAndAncestors(categoryId: string, currency: string, value: number) {
    let current = categoryById.get(categoryId); let guard = 0;
    while (current && guard < 8) {
      if (!categoryTotals.has(current.id)) categoryTotals.set(current.id, new Map());
      addTotal(categoryTotals.get(current.id)!, currency, value);
      current = current.parentId ? categoryById.get(current.parentId) : undefined; guard++;
    }
  }

  for (const purchase of purchases) {
    const total = purchase.items.reduce((sum,item)=>sum+Number(item.amount),0);
    addTotal(expenseTotals,purchase.currency,total);
    if (purchase.baseAmount == null) missingFx++; else expenseBase += Number(purchase.baseAmount);
    const personKey = purchase.person?.name ?? "Közös";
    if (!personExpense.has(personKey)) personExpense.set(personKey,new Map());
    addTotal(personExpense.get(personKey)!,purchase.currency,total);
    if (purchase.baseAmount != null) personExpenseBase.set(personKey,(personExpenseBase.get(personKey)??0)+Number(purchase.baseAmount));
    for (const item of purchase.items) {
      const amount=Number(item.amount);
      if (item.categoryId && categoryById.has(item.categoryId)) addCategoryAndAncestors(item.categoryId,purchase.currency,amount); else addTotal(uncategorized,purchase.currency,amount);
    }
  }
  for (const income of incomes) {
    addTotal(incomeTotals,income.currency,Number(income.amount));
    if (income.baseAmount == null) missingFx++; else incomeBase += Number(income.baseAmount);
  }

  type TreeNode={id:string;name:string;color:string;depth:number;totals:[string,number][];children:TreeNode[]};
  function makeNode(id:string):TreeNode|null {
    const cat=categoryById.get(id); if(!cat)return null;
    const totals=entries(categoryTotals.get(id));
    const children=categories.filter(c=>c.parentId===id&&categoryTotals.has(c.id)).map(c=>makeNode(c.id)).filter((v):v is TreeNode=>Boolean(v));
    if(!totals.length&&!children.length)return null;
    return {id:cat.id,name:cat.name,color:rootColor(cat.id,categories),depth:cat.depth,totals,children};
  }
  const tree=categories.filter(c=>c.depth===1&&categoryTotals.has(c.id)).map(c=>makeNode(c.id)).filter((v):v is TreeNode=>Boolean(v));
  tree.sort((a,b)=>b.totals.reduce((s,[,v])=>s+v,0)-a.totals.reduce((s,[,v])=>s+v,0));
  const uncategorizedNode=uncategorized.size?{id:"uncategorized",name:"Nincs kategorizálva",color:"#c8cbd0",depth:1,totals:entries(uncategorized),children:[]}:null;
  const currencies=[...new Set([...incomeTotals.keys(),...expenseTotals.keys()])].sort();
  const recent=[
    ...purchases.slice(0,5).map(p=>({id:p.id,href:`/app/history/expense/${p.id}`,date:p.date,label:p.merchant?.name??p.items[0]?.label??"Kiadás",amount:-p.items.reduce((s,i)=>s+Number(i.amount),0),currency:p.currency})),
    ...incomes.slice(0,5).map(i=>({id:i.id,href:`/app/history/income/${i.id}`,date:i.date,label:i.label,amount:Number(i.amount),currency:i.currency})),
  ].sort((a,b)=>b.date.getTime()-a.date.getTime()).slice(0,6);

  const actualClosing = snapshot?.entries.reduce((sum,row)=>sum+Number(row.baseAmount??0),0) ?? null;
  const actualMissing = snapshot?.entries.some(row=>row.baseAmount==null) ?? false;

  return <main className="page dashboard-page">
    <div className="dashboard-head">
      <div><div className="eyebrow">{period.subtitle}</div><h1 className="page-title">{period.title}</h1><p className="muted">{purchases.length+incomes.length} pénzmozgás ebben az időszakban</p></div>
      <PeriodNavigator mode={period.mode} year={period.year} month={period.month} from={period.from} to={period.to}/>
    </div>

    <section className="balance-hero financial-core-hero">
      <div className="hero-copy"><span className="summary-label">Nettó pénzmozgás · {user.baseCurrency}</span><div className="hero-values"><div>{formatMoney(incomeBase-expenseBase,user.baseCurrency)}</div></div><p>A tranzakció napjához rögzített napi árfolyamok alapján. Az eredeti valuták minden rekordban megmaradnak.</p></div>
      <div className="hero-mini-grid">
        <div className="hero-mini income"><span>Bevétel · {user.baseCurrency}</span><strong>{formatMoney(incomeBase,user.baseCurrency)}</strong>{entries(incomeTotals).map(([c,v])=><small key={c}>{formatMoney(v,c)}</small>)}</div>
        <div className="hero-mini expense"><span>Kiadás · {user.baseCurrency}</span><strong>{formatMoney(expenseBase,user.baseCurrency)}</strong>{entries(expenseTotals).map(([c,v])=><small key={c}>{formatMoney(v,c)}</small>)}</div>
      </div>
    </section>
    <FxBackfillButton year={period.year} month={period.mode==="month"?period.month:undefined} missing={missingFx}/>

    {period.mode==="month" && <section className="month-close-strip">
      <div><span className="summary-label">Havi zárás</span>{snapshot?.closedAt ? <><strong>{actualMissing?"Árfolyamra vár":formatMoney(actualClosing??0,user.baseCurrency)}</strong><small>Tényleges záró · lezárva {snapshot.closedAt.toLocaleDateString("hu-HU")}</small></> : <><strong>Nincs lezárva</strong><small>Add meg a hónap végi tényleges készpénz- és számlaegyenlegeket.</small></>}</div>
      <a className="primary compact-button" href={`/app/closing?year=${period.year}&month=${period.month}`}>{snapshot?.closedAt?"Zárás megnyitása":"Hónap zárása"}</a>
    </section>}

    <section className="metric-strip">
      {[...people.map(p=>p.name),"Közös"].map((name,index)=>{const totals=entries(personExpense.get(name));return <div className="person-metric" key={name}><span className={`avatar pastel-${(index%4)+1}`}>{name.slice(0,1).toUpperCase()}</span><div><small>{name} kiadásai</small><strong>{formatMoney(personExpenseBase.get(name)??0,user.baseCurrency)}</strong>{totals.map(([c,v])=><span className="metric-original" key={c}>{formatMoney(v,c)}</span>)}</div></div>})}
    </section>

    <section className="dashboard-grid">
      <div className="panel breakdown-panel"><div className="panel-head"><div><h2>Kiadások kategóriánként</h2><p className="muted section-note">Kattints a sorokra a részletes bontáshoz.</p></div><span className="soft-badge">drill-down</span></div><CategoryBreakdown nodes={tree} uncategorized={uncategorizedNode}/></div>
      <div className="panel recent-panel"><div className="panel-head"><div><h2>Legutóbbi tételek</h2><p className="muted section-note">Szerkesztéshez kattints egy rekordra.</p></div><a className="text-link" href="/app/history">Összes ›</a></div><div className="recent-list">{recent.length?recent.map(row=><a className="recent-row" href={row.href} key={`${row.href}-${row.id}`}><span className={`recent-sign ${row.amount<0?"expense":"income"}`}>{row.amount<0?"−":"+"}</span><span className="recent-copy"><strong>{row.label}</strong><small>{row.date.toLocaleDateString("hu-HU")}</small></span><span className={row.amount<0?"negative":"positive"}>{row.amount<0?"−":"+"}{formatMoney(Math.abs(row.amount),row.currency)}</span></a>):<p className="muted empty-state">Még nincs pénzmozgás.</p>}</div></div>
    </section>
  </main>;
}
