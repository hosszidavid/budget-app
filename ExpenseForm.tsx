"use client";
import { createClientId } from "@/lib/client-id";

import { ItemAutocomplete } from "./ItemAutocomplete";
import { CategoryPicker } from "./CategoryPicker";
import { currencies } from "@/lib/money";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Person = { id: string; name: string };
type Category = { id: string; name: string; parentId: string | null; depth: number; path: string; color?: string | null; amountBehavior: "NORMAL" | "NEGATIVE" | "POSITIVE" };
type Merchant = { id: string; name: string };
type InitialItem = { label?: string; categoryId?: string | null; categoryPath?: string };

type Row = {
  id: string;
  label: string;
  amount: string;
  reusableItemId: string | null;
  categoryId: string | null;
  categoryPath: string;
  isDairy: boolean;
  containsEgg: boolean;
  containsAnimal: boolean;
  isAlcohol: boolean;
  isFrozen: boolean;
  isCanned: boolean;
  isPackaged: boolean;
  fuelLiters: string;
};

type InitialPurchase = {
  id: string;
  date: string;
  personId: string | null;
  merchant: string;
  currency: string;
  note: string;
  items: Array<{
    id: string;
    label: string;
    amount: number;
    reusableItemId: string | null;
    categoryId: string | null;
    categoryPath: string;
    isDairy: boolean;
    containsEgg: boolean;
    containsAnimal: boolean;
    isAlcohol: boolean;
    isFrozen: boolean;
    isCanned: boolean;
    isPackaged: boolean;
    fuelLiters: number | null;
  }>;
};

const blank = (id: string = createClientId("expense-line"), initial?: InitialItem): Row => ({
  id,
  label: initial?.label ?? "",
  amount: "",
  reusableItemId: null,
  categoryId: initial?.categoryId ?? null,
  categoryPath: initial?.categoryPath ?? "",
  isDairy: false,
  containsEgg: false,
  containsAnimal: false,
  isAlcohol: false,
  isFrozen: false,
  isCanned: false,
  isPackaged: false,
  fuelLiters: "",
});

function localToday() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function ExpenseForm({
  people,
  categories,
  merchants,
  initialItem,
  initialPurchase,
}: {
  people: Person[];
  categories: Category[];
  merchants: Merchant[];
  initialItem?: InitialItem;
  initialPurchase?: InitialPurchase;
}) {
  const router = useRouter();
  const [date, setDate] = useState(initialPurchase?.date ?? localToday());
  const [personId, setPersonId] = useState(initialPurchase?.personId ?? "");
  const [merchant, setMerchant] = useState(initialPurchase?.merchant ?? "");
  const [currency, setCurrency] = useState(initialPurchase?.currency ?? "CHF");
  const [note, setNote] = useState(initialPurchase?.note ?? "");
  const [rows, setRows] = useState<Row[]>(initialPurchase?.items.length ? initialPurchase.items.map(item => ({
    id: item.id,
    label: item.label,
    amount: String(item.amount),
    reusableItemId: item.reusableItemId,
    categoryId: item.categoryId,
    categoryPath: item.categoryPath,
    isDairy: item.isDairy,
    containsEgg: item.containsEgg,
    containsAnimal: item.containsAnimal,
    isAlcohol: item.isAlcohol,
    isFrozen: item.isFrozen,
    isCanned: item.isCanned,
    isPackaged: item.isPackaged,
    fuelLiters: item.fuelLiters == null ? "" : String(item.fuelLiters),
  })) : [blank("initial", initialItem)]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const effectiveAmount = (r: Row) => { const n = Number(r.amount) || 0; const b = categories.find(c => c.id === r.categoryId)?.amountBehavior ?? "NORMAL"; return b === "NEGATIVE" ? -Math.abs(n) : b === "POSITIVE" ? Math.abs(n) : n; };
  const total = useMemo(() => rows.reduce((sum, r) => sum + effectiveAmount(r), 0), [rows, categories]);
  const isEditing = Boolean(initialPurchase?.id);

  function patch(id: string, patchValue: Partial<Row>) {
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patchValue } : r));
  }

  async function save() {
    setError("");
    const valid = rows.filter(r => r.label.trim() && Number(r.amount) !== 0);
    if (!valid.length) return setError("Adj meg legalább egy tételt és összeget.");
    const missingCategory = valid.find(r => !r.categoryId);
    if (missingCategory) return setError(`A(z) „${missingCategory.label}” tételhez válassz kategóriát. Minden kézi kiadásnál kötelező a kategória.`);
    setBusy(true);
    const endpoint = isEditing ? `/api/expenses/${initialPurchase!.id}` : "/api/expenses";
    const res = await fetch(endpoint, {
      method: isEditing ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date,
        personId: personId || null,
        merchant: merchant || null,
        currency,
        note: note || null,
        items: valid.map(({ id, ...r }) => ({
          ...r,
          amount: Number(r.amount),
          fuelLiters: r.fuelLiters ? Number(r.fuelLiters) : null,
        })),
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Nem sikerült menteni.");
    if (isEditing) {
      router.push("/app/history");
    } else {
      const d = new Date(`${date}T12:00:00`);
      router.push(`/app?mode=month&year=${d.getFullYear()}&month=${d.getMonth() + 1}`);
    }
    router.refresh();
  }

  return <div className="form-card">
    {error && <div className="error">{error}</div>}
    <div className="form-grid-2">
      <div className="field"><label>Dátum</label><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
      <div className="field"><label>Személy</label><select className="select" value={personId} onChange={e => setPersonId(e.target.value)}><option value="">Közös</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div className="field"><label>Bolt / partner</label><input className="input" list="merchant-list" value={merchant} onChange={e => setMerchant(e.target.value)} placeholder="pl. Coop" /><datalist id="merchant-list">{merchants.map(m => <option key={m.id}>{m.name}</option>)}</datalist></div>
      <div className="field"><label>Valuta</label><select className="select" value={currency} onChange={e => setCurrency(e.target.value)}>{currencies.map(c => <option key={c}>{c}</option>)}</select></div>
    </div>

    <div className="items-box">
      <div className="panel-head"><div><h2>Tételek</h2><p className="muted section-note">Egy vásárlásban több külön kategóriájú tétel is lehet.</p></div><button className="secondary" type="button" onClick={() => setRows(r => [...r, blank()])}>+ Tétel</button></div>
      {rows.map(r => <div className={`item-card ${r.label.trim() && Number(r.amount) !== 0 && !r.categoryId ? "missing-category" : ""}`} key={r.id}>
        <div className="item-top">
          <div>
            <ItemAutocomplete
              value={r}
              onChange={(v) => {
                const d = v.defaults ?? {};
                patch(r.id, {
                  label: v.label,
                  reusableItemId: v.reusableItemId ?? null,
                  categoryId: v.categoryId ?? null,
                  categoryPath: v.categoryPath ?? "",
                  isDairy: !!d.isDairy,
                  containsEgg: !!d.containsEgg,
                  containsAnimal: !!d.containsAnimal,
                  isAlcohol: !!d.isAlcohol,
                  isFrozen: !!d.isFrozen,
                  isCanned: !!d.isCanned,
                  isPackaged: !!d.isPackaged,
                });
              }}
            />
            <div className="item-meta">{r.categoryPath || "Új vagy még nem kategorizált tétel"}</div>
          </div>
          <input className="input amount-input" inputMode="decimal" placeholder="0.00" value={r.amount} onChange={e => patch(r.id, { amount: e.target.value.replace(",", ".") })} />
          <button className="ghost danger-link remove-row" type="button" aria-label="Tétel törlése" onClick={() => setRows(rs => rs.length === 1 ? [blank()] : rs.filter(x => x.id !== r.id))}>×</button>
        </div>

        <div className="attribute-panel expense-attributes">
          <div className="attribute-title">Kategória és attribútumok</div>
          <CategoryPicker
            categories={categories}
            value={r.categoryId}
            required
            onChange={(categoryId) => {
              const c = categoryId ? categories.find(x => x.id === categoryId) : undefined;
              patch(r.id, { categoryId, categoryPath: c?.path ?? "" });
            }}
          />

          {r.label.trim() && !r.categoryId && <div className="category-required-note">Válassz kategóriát ehhez az új tételhez. A kiadás addig nem menthető.</div>}
          {categories.find(c => c.id === r.categoryId)?.amountBehavior === "NEGATIVE" && <div className="correction-hint">− Negatív korrekció: az összeg automatikusan levonódik az összesből.</div>}

          {r.categoryPath.startsWith("Étel és ital") && <div className="attr-row compact-attributes">
            {[["isDairy", "Tejtermék"], ["containsEgg", "Tojás"], ["containsAnimal", "Állati"], ["isAlcohol", "Alkoholos"]].map(([key, label]) => <label className="check-chip" key={key}><input type="checkbox" checked={Boolean(r[key as keyof Row])} onChange={e => patch(r.id, { [key]: e.target.checked } as Partial<Row>)} />{label}</label>)}
            {(r.categoryPath.includes("Gyümölcs") || r.categoryPath.includes("Zöldség")) && [["isFrozen", "Fagyasztott"], ["isCanned", "Konzerv"], ["isPackaged", "Csomagolt"]].map(([key, label]) => <label className="check-chip" key={key}><input type="checkbox" checked={Boolean(r[key as keyof Row])} onChange={e => patch(r.id, { [key]: e.target.checked } as Partial<Row>)} />{label}</label>)}
          </div>}

          {(r.label.toLocaleLowerCase("hu-HU").includes("üzemanyag") || r.categoryPath.includes("Üzemanyag")) && <div className="fuel-inline">
            <div className="field compact-field"><label>Üzemanyag mennyiség (liter)</label><input className="input" inputMode="decimal" value={r.fuelLiters} onChange={e => patch(r.id, { fuelLiters: e.target.value.replace(",", ".") })} placeholder="pl. 43.21" /></div>
            {Number(r.fuelLiters) > 0 && Number(r.amount) > 0 && <div className="fuel-price"><span>Ár / liter</span><strong>{(Number(r.amount) / Number(r.fuelLiters)).toFixed(3)} {currency}/L</strong></div>}
          </div>}
        </div>
      </div>)}
      <div className="item-total"><span>Összesen</span><span>{total.toFixed(2)} {currency}</span></div>
    </div>

    <div className="field" style={{ marginTop: 18 }}><label>Megjegyzés</label><textarea className="textarea" value={note} onChange={e => setNote(e.target.value)} placeholder="Opcionális" /></div>
    <button className="primary" onClick={save} disabled={busy}>{busy ? "Mentés…" : isEditing ? "Módosítások mentése" : "Kiadás mentése"}</button>
  </div>;
}
