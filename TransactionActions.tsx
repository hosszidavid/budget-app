"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TransactionActions({ type, id }: { type: "expense" | "income"; id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (!window.confirm("Biztosan törlöd ezt a pénzmozgást? Az adat soft delete-tal kerül eltávolításra.")) return;
    setBusy(true); setError("");
    const res = await fetch(`/api/${type === "expense" ? "expenses" : "incomes"}/${id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Nem sikerült törölni.");
    router.push("/app/history");
    router.refresh();
  }

  return <div className="transaction-actions">
    <button className="danger-button" onClick={remove} disabled={busy}>{busy ? "Törlés…" : "Törlés"}</button>
    {error && <span className="error-inline">{error}</span>}
  </div>;
}
