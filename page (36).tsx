import { ClosingForm } from "@/components/ClosingForm";
import { requireUser } from "@/lib/auth";
import { monthBaseFlow, previousClosing } from "@/lib/finance";
import { prisma } from "@/lib/prisma";

const monthNames = ["Január","Február","Március","Április","Május","Június","Július","Augusztus","Szeptember","Október","November","December"];

export default async function ClosingPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const now = new Date();
  const year = Math.min(2200, Math.max(2000, Number(sp.year) || now.getFullYear()));
  const month = Math.min(12, Math.max(1, Number(sp.month) || now.getMonth() + 1));
  const [flow, previous, snapshot, people, locations] = await Promise.all([
    monthBaseFlow(user.id, year, month),
    previousClosing(user.id, year, month),
    prisma.monthSnapshot.findUnique({ where: { userId_year_month: { userId: user.id, year, month } }, include: { entries: true } }),
    prisma.person.findMany({ where: { userId: user.id, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.balanceLocation.findMany({ where: { userId: user.id, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return <main className="page">
    <div className="page-head"><div><div className="eyebrow">Havi zárás</div><h1 className="page-title">{monthNames[month - 1]} {year}</h1><p className="muted">Az automatikus matematika ellenőrzés, a kézzel megadott tényleges pénzállomány a hiteles záróérték.</p></div><a className="secondary" href={`/app?mode=month&year=${year}&month=${month}`}>← Áttekintés</a></div>
    <ClosingForm
      year={year} month={month} baseCurrency={user.baseCurrency}
      people={people} locations={locations}
      autoOpening={previous && !previous.missingFx ? previous.actual : null}
      manualOpening={snapshot?.manualOpeningBase == null ? null : Number(snapshot.manualOpeningBase)}
      incomeBase={flow.incomeBase} expenseBase={flow.expenseBase} missingFlowFx={flow.missingFx}
      existingNote={snapshot?.note ?? ""}
      existingClosedAt={snapshot?.closedAt?.toISOString() ?? null}
      existingExpectedAtClose={snapshot?.expectedAtClose == null ? null : Number(snapshot.expectedAtClose)}
      existingEntries={(snapshot?.entries ?? []).map(row => ({ id: row.id, personId: row.personId, label: row.label, amount: Number(row.amount), currency: row.currency, baseAmount: row.baseAmount == null ? null : Number(row.baseAmount) }))}
    />
  </main>;
}
