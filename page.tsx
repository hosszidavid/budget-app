"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: data.get("email"), password: data.get("password"), registrationToken: data.get("registrationToken") || undefined }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(body.error ?? "Sikertelen regisztráció.");
    router.push("/app"); router.refresh();
  }

  return <main className="auth-page"><div className="auth-card">
    <h1>Új Budget</h1>
    <p>A regisztráció létrehozza az induló kategóriafát, Dávid és Petra személyeket, valamint az újrahasználható tételeket.</p>
    {error && <div className="error">{error}</div>}
    <form onSubmit={submit}>
      <div className="field"><label>Email</label><input className="input" name="email" type="email" required autoComplete="email" /></div>
      <div className="field"><label>Jelszó</label><input className="input" name="password" type="password" minLength={10} required autoComplete="new-password" /></div><div className="field"><label>Regisztrációs kód <span className="optional-label">ha szükséges</span></label><input className="input" name="registrationToken" type="password" autoComplete="off" /></div>
      <button className="primary" style={{width:"100%"}} disabled={busy}>{busy ? "Létrehozás…" : "Fiók létrehozása"}</button>
    </form>
    <p style={{marginTop:18, marginBottom:0, fontSize:13}}>Van már fiókod? <Link href="/login"><strong>Belépés</strong></Link></p>
  </div></main>;
}
