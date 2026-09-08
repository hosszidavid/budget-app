"use client";

import { ItemAutocomplete } from "./ItemAutocomplete";
import { currencies } from "@/lib/money";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Person = { id: string; name: string };
type Category = { id: string; path: string };
type IncomeItem = { label: string; categoryId: string | null; categoryPath: string; reusableItemId?: string | null };
type InitialIncome = { id: string; date: string; personId: string; categoryId: string; label: string; amount: number; currency: string; note: string };

function localToday() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function IncomeForm({ people, categories, initialIncome }: { people: Person[]; categories: Category[]; initialIncome?: InitialIncome }) {
  const router = useRouter();
  const [date, setDate] = useState(initialIncome?.date ?? localToday());
  const [personId, setPersonId] = useState(initialIncome?.personId ?? people[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState(initialIncome?.categoryId ?? "");
  const selectedInitialCategory = categories.find(c => c.id === initialIncome?.categoryId);
  const [item, setItem] = useState<IncomeItem>({ label: initialIncome?.label ?? "", categoryId: initialIncome?.categoryId ?? null, categoryPath: selectedInitialCategory?.path ?? "" });
  const [amount, setAmount] = useState(initialIncome ? String(initialIncome.amount) : "");
  const [currency, setCurrency] = useState(initialIncome?.currency ?? "CHF");
  const [note, setNote] = useState(initialIncome?.note ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isEditing = Boolean(initialIncome?.id);

  async function save() {
    setError("");
    if (!personId || !categoryId || Number(amount) <= 0) return setError("A személy, kategória és összeg szükséges.");
    setBusy(true);
    const res = await fetch(isEditing ? `/api/incomes/${initialIncome!.id}` : "/api/incomes", {
      method: isEditing ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date, personId, label: item.label.trim() || null, categoryId, amount: Number(amount), currency, note: note || null }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Nem sikerült menteni.");
    if (isEditing) router.push("/app/history");
    else {
      const d = new Date(`${date}T12:00:00`);
      router.push(`/app?mode=month&year=${d.getFullYear()}&month=${d.getMonth() + 1}`);
    }
    router.refresh();
  }

  const selectedCategory = categories.find(c => c.id === categoryId);

  return <div className="form-card">
    {error && <div className="error">{error}</div>}
    <div className="form-grid-2">
      <div className="field"><label>Dátum</label><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
      <div className="field"><label>Személy</label><select className="select" value={personId} onChange={e => setPersonId(e.target.value)}>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div className="field"><label>Kategória</label><select className="select" value={categoryId} onChange={e => {
        const nextId = e.target.value;
        const c = categories.find(x => x.id === nextId);
        setCategoryId(nextId);
        setItem({ label: "", categoryId: nextId || null, categoryPath: c?.path ?? "" });
      }}><option value="">Válassz kategóriát</option>{categories.map(c => <option key={c.id} value={c.id}>{c.path}</option>)}</select></div>
      <div className="field"><label>Megnevezés</label><ItemAutocomplete kind="INCOME" categoryId={categoryId || null} value={item} onChange={next => setItem({ label: next.label, reusableItemId: next.reusableItemId ?? null, categoryId, categoryPath: selectedCategory?.path ?? "" })} /><small className="muted">Opcionális, pl. Naturklang. A kategória önmagában is elég.</small></div>
      <div className="field"><label>Összeg</label><input className="input" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(",", "."))} placeholder="0.00" /></div>
      <div className="field"><label>Valuta</label><select className="select" value={currency} onChange={e => setCurrency(e.target.value)}>{currencies.map(c => <option key={c}>{c}</option>)}</select></div>
    </div>
    <div className="field"><label>Megjegyzés</label><textarea className="textarea" value={note} onChange={e => setNote(e.target.value)} placeholder="Opcionális" /></div>
    <button className="primary" onClick={save} disabled={busy}>{busy ? "Mentés…" : isEditing ? "Módosítások mentése" : "Bevétel mentése"}</button>
  </div>;
}
