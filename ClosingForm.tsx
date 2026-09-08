"use client";
import { createClientId } from "@/lib/client-id";

import { currencies, formatMoney } from "@/lib/money";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Person = { id: string; name: string };
type Location = { id: string; name: string };
type Entry = { id: string; personId: string; location: string; amount: string; currency: string };

type Props = {
  year: number;
  month: number;
  baseCurrency: string;
  people: Person[];
  locations: Location[];
  autoOpening: number | null;
  manualOpening: number | null;
  incomeBase: number;
  expenseBase: number;
  existingNote: string;
  existingClosedAt: string | null;
  existingExpectedAtClose: number | null;
  existingEntries: Array<{ id: string; personId: string | null; label: string; amount: number; currency: string; baseAmount: number | null }>;
  missingFlowFx: number;
};

const blank = (): Entry => ({ id: createClientId("closing-line"), personId: "", location: "", amount: "", currency: "CHF" });

export function ClosingForm(props: Props) {
  const router = useRouter();
  const [manualOpening, setManualOpening] = useState(props.manualOpening == null ? "" : String(props.manualOpening));
  const [note, setNote] = useState(props.existingNote);
  const [rows, setRows] = useState<Entry[]>(props.existingEntries.length ? props.existingEntries.map(r => ({ id: r.id, personId: r.personId ?? "", location: r.label, amount: String(r.amount), currency: r.currency })) : [blank()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const opening = manualOpening === "" ? (props.autoOpening ?? 0) : Number(manualOpening || 0);
  const expected = opening + props.incomeBase - props.expenseBase;
  const roughActual = useMemo(() => rows.reduce((sum, row) => row.currency === props.baseCurrency ? sum + Number(row.amount || 0) : sum, 0), [rows, props.baseCurrency]);

  function patch(id: string, data: Partial<Entry>) {
    setRows(current => current.map(r => r.id === id ? { ...r, ...data } : r));
  }

  async function save(close: boolean) {
    setError("");
    const entries = rows.filter(r => r.location.trim() || Number(r.amount) > 0).map(r => ({ personId: r.personId || null, location: r.location.trim(), amount: Number(r.amount), currency: r.currency }));
    if (entries.some(r => !r.location || !Number.isFinite(r.amount) || r.amount < 0)) return setError("Minden megadott pénzállomány-sornál szükséges a hely és az érvényes összeg.");
    setBusy(true);
    const res = await fetch("/api/closing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ year: props.year, month: props.month, manualOpeningBase: manualOpening === "" ? null : Number(manualOpening), note: note || null, close, entries }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Nem sikerült menteni a havi zárást.");
    router.refresh();
  }

  return <div className="closing-layout">
    <section className="panel closing-summary-card">
      <div className="closing-summary-grid">
        <div><span>Nyitó egyenleg</span><strong>{formatMoney(opening, props.baseCurrency)}</strong><small>{manualOpening === "" ? (props.autoOpening == null ? "Nincs előző lezárt hónap, ezért 0 CHF. Felülírható." : "Automatikusan az előző lezárt hónap tényleges zárója.") : "Kézzel felülírt nyitóegyenleg."}</small></div>
        <div className="positive-block"><span>Bevétel</span><strong>{formatMoney(props.incomeBase, props.baseCurrency)}</strong></div>
        <div className="negative-block"><span>Kiadás</span><strong>{formatMoney(props.expenseBase, props.baseCurrency)}</strong></div>
        <div className="expected-block"><span>Elvárt záró</span><strong>{formatMoney(expected, props.baseCurrency)}</strong></div>
      </div>
      {props.missingFlowFx > 0 && <div className="warning">{props.missingFlowFx} pénzmozgásnál még nincs napi árfolyam, ezért az elvárt CHF záró jelenleg nem teljes.</div>}
      {props.existingClosedAt && <div className="closing-status">Lezárva: {new Date(props.existingClosedAt).toLocaleString("hu-HU")}{props.existingExpectedAtClose != null ? ` · akkori elvárt: ${formatMoney(props.existingExpectedAtClose, props.baseCurrency)}` : ""}</div>}
    </section>

    <section className="panel closing-editor">
      {error && <div className="error">{error}</div>}
      <div className="field"><label>Kézi nyitóegyenleg ({props.baseCurrency})</label><input className="input" inputMode="decimal" value={manualOpening} onChange={e => setManualOpening(e.target.value.replace(",", "."))} placeholder={props.autoOpening == null ? "Opcionális, pl. 12500" : `Automatikus: ${props.autoOpening.toFixed(2)}`} /><small className="muted">Hagyd üresen az automatikus előző havi tényleges záró használatához.</small></div>

      <div className="panel-head"><div><h2>Tényleges pénz hónap végén</h2><p className="muted section-note">A kézzel megadott állapot a hiteles adat. Több személyt, készpénzt, számlát vagy Wise-egyenleget is felvihetsz.</p></div><button className="secondary" type="button" onClick={() => setRows(r => [...r, blank()])}>+ Sor</button></div>
      <datalist id="balance-locations">{props.locations.map(l => <option key={l.id} value={l.name} />)}</datalist>
      <div className="balance-entry-list">{rows.map(row => <div className="balance-entry-row" key={row.id}>
        <select className="select" value={row.personId} onChange={e => patch(row.id, { personId: e.target.value })}><option value="">Közös / nincs személy</option>{props.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <input className="input" list="balance-locations" value={row.location} onChange={e => patch(row.id, { location: e.target.value })} placeholder="KP, Számla, Wise…" />
        <input className="input" inputMode="decimal" value={row.amount} onChange={e => patch(row.id, { amount: e.target.value.replace(",", ".") })} placeholder="0.00" />
        <select className="select" value={row.currency} onChange={e => patch(row.id, { currency: e.target.value })}>{currencies.map(c => <option key={c}>{c}</option>)}</select>
        <button className="ghost danger-link" type="button" onClick={() => setRows(rs => rs.length === 1 ? [blank()] : rs.filter(x => x.id !== row.id))}>×</button>
      </div>)}</div>
      <div className="closing-preview"><span>CHF sorok gyors előnézete</span><strong>{formatMoney(roughActual, props.baseCurrency)}</strong><small>A végleges tényleges egyenleg a nem CHF sorok hónap végi árfolyamával mentéskor számolódik.</small></div>
      <div className="field"><label>Megjegyzés</label><textarea className="textarea" value={note} onChange={e => setNote(e.target.value)} placeholder="Opcionális" /></div>
      <div className="closing-actions"><button className="secondary" disabled={busy} onClick={() => save(false)}>{busy ? "Mentés…" : "Piszkozat mentése"}</button><button className="primary" disabled={busy} onClick={() => save(true)}>{busy ? "Mentés…" : "Hónap lezárása"}</button></div>
    </section>
  </div>;
}
