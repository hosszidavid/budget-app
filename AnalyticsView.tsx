"use client";

/**
 * Dependency-free analytics visualizations.
 * The app deliberately avoids a chart library here: the datasets are small,
 * and SVG/CSS keeps bundle size and mobile rendering predictable.
 */
import { useMemo, useState } from "react";

type ExpenseEvent = {
  date: string;
  amount: number;
  label: string;
  merchant: string;
  person: string;
  categoryId: string;
  categoryName: string;
  categoryPath: string;
  categoryColor: string;
};

type IncomeEvent = { date: string; amount: number; person: string; label: string };

type Props = {
  expenses: ExpenseEvent[];
  incomes: IncomeEvent[];
  people: string[];
  mode: "month" | "year" | "custom";
  year: number;
  month: number;
  baseCurrency: string;
  missingFx: number;
};

const money = (value: number, currency: string) => new Intl.NumberFormat("hu-HU", {
  style: "currency",
  currency,
  minimumFractionDigits: currency === "HUF" ? 0 : 2,
  maximumFractionDigits: currency === "HUF" ? 0 : 2,
}).format(value);

function isoDay(date: Date) { return date.toISOString().slice(0, 10); }
function dayLabel(iso: string) { return new Date(`${iso}T12:00:00Z`).toLocaleDateString("hu-HU", { month: "short", day: "numeric" }); }

export function AnalyticsView({ expenses, incomes, people, mode, year, month, baseCurrency, missingFx }: Props) {
  const [person, setPerson] = useState("Összes");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [tableSort, setTableSort] = useState<"amount" | "name" | "count">("amount");

  const filteredExpenses = useMemo(() => expenses.filter(row =>
    (person === "Összes" || row.person === person) && (!selectedCategory || row.categoryId === selectedCategory)
  ), [expenses, person, selectedCategory]);
  const filteredIncomes = useMemo(() => incomes.filter(row => person === "Összes" || row.person === person), [incomes, person]);

  const categoryData = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string; amount: number; count: number }>();
    for (const row of expenses.filter(r => person === "Összes" || r.person === person)) {
      const current = map.get(row.categoryId) ?? { id: row.categoryId, name: row.categoryName, color: row.categoryColor, amount: 0, count: 0 };
      current.amount += row.amount;
      current.count += 1;
      map.set(row.categoryId, current);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [expenses, person]);

  const totalExpense = filteredExpenses.reduce((sum, row) => sum + row.amount, 0);
  const totalIncome = filteredIncomes.reduce((sum, row) => sum + row.amount, 0);
  const net = totalIncome - totalExpense;

  const daily = useMemo(() => {
    const map = new Map<string, { expense: number; income: number; count: number }>();
    for (const row of filteredExpenses) {
      const item = map.get(row.date) ?? { expense: 0, income: 0, count: 0 };
      item.expense += row.amount; item.count += 1; map.set(row.date, item);
    }
    for (const row of filteredIncomes) {
      const item = map.get(row.date) ?? { expense: 0, income: 0, count: 0 };
      item.income += row.amount; map.set(row.date, item);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, ...value }));
  }, [filteredExpenses, filteredIncomes]);

  const groupedBars = useMemo(() => {
    if (mode === "year") {
      const rows = Array.from({ length: 12 }, (_, i) => ({ key: String(i), label: new Date(Date.UTC(year, i, 1)).toLocaleDateString("hu-HU", { month: "short" }), expense: 0 }));
      for (const row of filteredExpenses) rows[new Date(`${row.date}T12:00:00Z`).getUTCMonth()].expense += row.amount;
      return rows;
    }
    const map = new Map<string, number>();
    for (const row of filteredExpenses) map.set(row.date, (map.get(row.date) ?? 0) + row.amount);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-16).map(([key, expense]) => ({ key, label: dayLabel(key), expense }));
  }, [filteredExpenses, mode, year]);

  const maxDaily = Math.max(1, ...daily.map(d => Math.max(d.expense, d.income)));
  const linePoints = (kind: "expense" | "income") => {
    if (!daily.length) return "";
    return daily.map((d, i) => {
      const x = daily.length === 1 ? 350 : 24 + (i / (daily.length - 1)) * 652;
      const y = 190 - (Math.max(0, d[kind]) / maxDaily) * 154;
      return `${x},${y}`;
    }).join(" ");
  };

  const positiveCategoryTotal = categoryData.reduce((sum, row) => sum + Math.max(0, row.amount), 0) || 1;
  let cursor = 0;
  const donutStops: string[] = [];
  for (const category of categoryData.filter(row => row.amount > 0)) {
    const start = cursor;
    cursor += category.amount / positiveCategoryTotal * 100;
    donutStops.push(`${category.color} ${start}% ${cursor}%`);
  }
  if (!donutStops.length) donutStops.push("var(--surface-3) 0 100%");

  const tableRows = [...categoryData].sort((a, b) => tableSort === "name" ? a.name.localeCompare(b.name, "hu") : tableSort === "count" ? b.count - a.count : b.amount - a.amount);
  const selectedCategoryName = selectedCategory ? categoryData.find(c => c.id === selectedCategory)?.name : null;

  const calendar = useMemo(() => {
    if (mode !== "month") return [];
    const first = new Date(Date.UTC(year, month - 1, 1));
    const last = new Date(Date.UTC(year, month, 0));
    const mondayOffset = (first.getUTCDay() + 6) % 7;
    const cells: Array<{ date: string | null; day?: number; expense?: number; income?: number; count?: number }> = Array.from({ length: mondayOffset }, () => ({ date: null }));
    const byDate = new Map(daily.map(d => [d.date, d]));
    for (let day = 1; day <= last.getUTCDate(); day++) {
      const date = isoDay(new Date(Date.UTC(year, month - 1, day)));
      const value = byDate.get(date);
      cells.push({ date, day, expense: value?.expense ?? 0, income: value?.income ?? 0, count: value?.count ?? 0 });
    }
    while (cells.length % 7) cells.push({ date: null });
    return cells;
  }, [daily, mode, year, month]);
  const calendarMax = Math.max(1, ...calendar.map(c => c.expense ?? 0));

  return <div className="analytics-stack">
    <div className="analytics-filterbar">
      <div className="analytics-person-filter" aria-label="Személy szűrő">
        {["Összes", ...people, ...expenses.map(row => row.person), ...incomes.map(row => row.person), "Közös"].filter((v, i, a) => a.indexOf(v) === i).map(name => <button key={name} className={person === name ? "active" : ""} onClick={() => setPerson(name)}>{name}</button>)}
      </div>
      {selectedCategory && <button className="secondary analytics-clear-filter" onClick={() => setSelectedCategory(null)}>× {selectedCategoryName}</button>}
    </div>

    {missingFx > 0 && <div className="warning analytics-warning">{missingFx} rekordhoz nincs CHF árfolyam, ezért ezek nem szerepelnek a CHF-alapú grafikonokban.</div>}

    <div className="analytics-metrics">
      <article><small>Kiadás</small><strong>{money(totalExpense, baseCurrency)}</strong></article>
      <article><small>Bevétel</small><strong>{money(totalIncome, baseCurrency)}</strong></article>
      <article><small>Nettó</small><strong className={net >= 0 ? "positive" : "negative"}>{money(net, baseCurrency)}</strong></article>
      <article><small>Tételek</small><strong>{filteredExpenses.length}</strong></article>
    </div>

    <div className="analytics-grid analytics-grid-top">
      <section className="analytics-card">
        <div className="analytics-card-head"><div><div className="eyebrow">Megoszlás</div><h2>Kiadások kategóriánként</h2></div><span>{money(categoryData.reduce((sum,row)=>sum+row.amount,0), baseCurrency)}</span></div>
        <div className="donut-layout">
          <div className="donut-chart" style={{ background: `conic-gradient(${donutStops.join(",")})` }}><div><strong>{categoryData.length}</strong><small>kategória</small></div></div>
          <div className="donut-legend">
            {categoryData.map(category => <button className={selectedCategory === category.id ? "active" : ""} key={category.id} onClick={() => setSelectedCategory(selectedCategory === category.id ? null : category.id)}>
              <i style={{ background: category.color }} /><span><strong>{category.name}</strong><small>{category.amount < 0 ? "korrekció" : `${(category.amount / positiveCategoryTotal * 100).toFixed(1)}%`}</small></span><b>{money(category.amount, baseCurrency)}</b>
            </button>)}
            {!categoryData.length && <div className="analytics-empty">Nincs kiadás ebben az időszakban.</div>}
          </div>
        </div>
      </section>

      <section className="analytics-card">
        <div className="analytics-card-head"><div><div className="eyebrow">Idővonal</div><h2>Pénzmozgás</h2></div><div className="analytics-chart-key"><span className="expense">Kiadás</span><span className="income">Bevétel</span></div></div>
        <div className="line-chart-wrap">
          {daily.length ? <svg className="line-chart" viewBox="0 0 700 220" role="img" aria-label="Napi kiadás és bevétel grafikon">
            {[36, 74, 112, 150, 188].map(y => <line key={y} x1="24" y1={y} x2="676" y2={y} className="chart-grid-line" />)}
            <polyline points={linePoints("expense")} className="chart-line expense" />
            <polyline points={linePoints("income")} className="chart-line income" />
          </svg> : <div className="analytics-empty chart-empty">Nincs megjeleníthető adat.</div>}
          {daily.length > 0 && <div className="line-chart-labels"><span>{dayLabel(daily[0].date)}</span><span>{dayLabel(daily[daily.length - 1].date)}</span></div>}
        </div>
      </section>
    </div>

    <div className="analytics-grid analytics-grid-bottom">
      <section className="analytics-card">
        <div className="analytics-card-head"><div><div className="eyebrow">Összehasonlítás</div><h2>{mode === "year" ? "Havi kiadás" : "Kiadási napok"}</h2></div></div>
        <div className="bar-chart">
          {groupedBars.map(row => {
            const max = Math.max(1, ...groupedBars.map(v => v.expense));
            return <div className="bar-column" key={row.key}><div className="bar-value">{row.expense > 0 ? money(row.expense, baseCurrency) : ""}</div><div className="bar-track"><div style={{ height: `${Math.max(row.expense > 0 ? 6 : 0, Math.max(0, row.expense) / max * 100)}%` }} /></div><small>{row.label}</small></div>;
          })}
          {!groupedBars.length && <div className="analytics-empty">Nincs megjeleníthető adat.</div>}
        </div>
      </section>

      <section className="analytics-card analytics-calendar-card">
        <div className="analytics-card-head"><div><div className="eyebrow">Naptár</div><h2>Költési naptár</h2></div></div>
        {mode === "month" ? <>
          <div className="calendar-weekdays">{["H", "K", "Sze", "Cs", "P", "Szo", "V"].map(day => <span key={day}>{day}</span>)}</div>
          <div className="analytics-calendar">{calendar.map((cell, index) => cell.date ? <div className="calendar-cell" key={cell.date} style={{ background: `color-mix(in srgb, #d98992 ${Math.round(((cell.expense ?? 0) / calendarMax) * 44)}%, var(--surface))` }}><b>{cell.day}</b>{(cell.expense ?? 0) > 0 && <strong>{money(cell.expense ?? 0, baseCurrency)}</strong>}{(cell.count ?? 0) > 0 && <small>{cell.count} tétel</small>}</div> : <div className="calendar-cell empty" key={`empty-${index}`} />)}</div>
        </> : <div className="analytics-empty calendar-mode-note">A naptárnézet havi módban mutatja a napi költéseket. Válts a fenti <strong>Hónap</strong> nézetre.</div>}
      </section>
    </div>

    <section className="analytics-card analytics-table-card">
      <div className="analytics-card-head"><div><div className="eyebrow">Táblázat</div><h2>Kategóriaösszesítő</h2></div><div className="analytics-table-sort"><button className={tableSort === "amount" ? "active" : ""} onClick={() => setTableSort("amount")}>Összeg</button><button className={tableSort === "count" ? "active" : ""} onClick={() => setTableSort("count")}>Tételek</button><button className={tableSort === "name" ? "active" : ""} onClick={() => setTableSort("name")}>Név</button></div></div>
      <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>Kategória</th><th>Kiadás</th><th>Arány</th><th>Tételek</th></tr></thead><tbody>{tableRows.map(row => <tr key={row.id} onClick={() => setSelectedCategory(selectedCategory === row.id ? null : row.id)} className={selectedCategory === row.id ? "active" : ""}><td><i style={{ background: row.color }} />{row.name}</td><td>{money(row.amount, baseCurrency)}</td><td>{row.amount < 0 ? "korrekció" : `${(row.amount / positiveCategoryTotal * 100).toFixed(1)}%`}</td><td>{row.count}</td></tr>)}</tbody></table></div>
    </section>
  </div>;
}
