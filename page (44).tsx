"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(body.error ?? "Sikertelen belépés.");
    router.push("/app"); router.refresh();
  }

  return <main className="auth-page"><div className="auth-card">
    <h1>Budget</h1>
    <p>Jelentkezz be, és ugyanazt az adatbázist használhatod minden eszközödön.</p>
    {error && <div className="error">{error}</div>}
    <form onSubmit={submit}>
      <div className="field"><label>Email</label><input className="input" name="email" type="email" required autoComplete="email" /></div>
      <div className="field"><label>Jelszó</label><input className="input" name="password" type="password" required autoComplete="current-password" /></div>
      <button className="primary" style={{width:"100%"}} disabled={busy}>{busy ? "Belépés…" : "Belépés"}</button>
    </form>
    <p style={{marginTop:18, marginBottom:0, fontSize:13}}>Még nincs fiókod? <Link href="/register"><strong>Regisztráció</strong></Link></p>
  </div></main>;
}
