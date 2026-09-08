"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function FxBackfillButton({ year, month, missing }: { year: number; month?: number; missing: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!missing) return null;
  async function run() {
    setBusy(true); setMessage("");
    const res = await fetch("/api/fx/recalculate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ year, month }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage(body.error ?? "Nem sikerült az árfolyamfrissítés.");
    setMessage(`${body.updated} árfolyam frissítve${body.pending ? `, ${body.pending} még függőben` : ""}.`);
    router.refresh();
  }
  return <div className="fx-pending"><span>{missing} tételnél hiányzik a CHF napi árfolyam.</span><button className="secondary compact-button" onClick={run} disabled={busy}>{busy ? "Frissítés…" : "Árfolyamok pótlása"}</button>{message && <small>{message}</small>}</div>;
}
