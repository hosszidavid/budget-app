"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Preview = {
  sameDataSpace: boolean;
  exportedAt: string;
  appVersion: string;
  dataSpaceId: string;
  counts: Record<string, number>;
};

export function SettingsPanel({ email, geminiModel, dataSpaceId }: { email: string; geminiModel: string; dataSpaceId: string }) {
  const router = useRouter();
  const [model, setModel] = useState(geminiModel);
  const [modelStatus, setModelStatus] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [backupPassword, setBackupPassword] = useState("");
  const [backup, setBackup] = useState<any>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importStatus, setImportStatus] = useState("");
  const [busy, setBusy] = useState("");

  const previewCounts = useMemo(() => preview ? Object.entries(preview.counts).filter(([,v])=>v>0) : [], [preview]);

  async function saveModel(next: string) {
    setModel(next); setModelStatus("Mentés…");
    const response = await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ geminiModel: next }) });
    const body = await response.json().catch(()=>({}));
    setModelStatus(response.ok ? "Elmentve." : body.error || "Nem sikerült menteni.");
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPasswordStatus(""); setBusy("password");
    const data = new FormData(event.currentTarget);
    const next = String(data.get("newPassword") || "");
    const confirm = String(data.get("confirmPassword") || "");
    if (next !== confirm) { setBusy(""); setPasswordStatus("A két új jelszó nem egyezik."); return; }
    const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword: data.get("currentPassword"), newPassword: next }) });
    const body = await response.json().catch(()=>({}));
    setBusy("");
    if (!response.ok) return setPasswordStatus(body.error || "A jelszó módosítása nem sikerült.");
    event.currentTarget.reset();
    setPasswordStatus("A jelszó megváltozott. A többi eszközön újra be kell jelentkezni.");
  }


  function bytesToBase64(bytes: Uint8Array) {
    let binary = "";
    const chunk = 0x8000;
    for (let i=0;i<bytes.length;i+=chunk) binary += String.fromCharCode(...bytes.subarray(i, i+chunk));
    return btoa(binary);
  }
  function base64ToBytes(value: string) {
    const binary = atob(value); const bytes = new Uint8Array(binary.length);
    for (let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  async function deriveBackupKey(password: string, salt: Uint8Array, usage: KeyUsage[]) {
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name:"PBKDF2", salt, iterations:250000, hash:"SHA-256" }, material, { name:"AES-GCM", length:256 }, false, usage);
  }
  async function downloadEncryptedBackup() {
    if (!globalThis.crypto?.subtle) { setImportStatus("A titkosított backuphoz HTTPS vagy secure browser context szükséges."); return; }
    if (backupPassword.length < 10) { setImportStatus("A titkosított backuphoz adj meg legalább 10 karakteres backup-jelszót."); return; }
    setBusy("encrypt"); setImportStatus("");
    try {
      const response = await fetch("/api/backup/export?images=1");
      if (!response.ok) throw new Error("A backup letöltése nem sikerült.");
      const plain = new Uint8Array(await response.arrayBuffer());
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveBackupKey(backupPassword, salt, ["encrypt"]);
      const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name:"AES-GCM", iv }, key, plain));
      const envelope = { format:"budget-app-encrypted-backup", version:1, kdf:"PBKDF2-SHA256", iterations:250000, salt:bytesToBase64(salt), iv:bytesToBase64(iv), ciphertext:bytesToBase64(ciphertext) };
      const blob = new Blob([JSON.stringify(envelope)], { type:"application/json" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href=url; a.download=`budget-backup-${new Date().toISOString().slice(0,10)}.budgetenc`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
      setImportStatus("Titkosított backup elkészült. A backup-jelszót külön őrizd meg, az app nem tárolja.");
    } catch (error) { setImportStatus(error instanceof Error ? error.message : "A titkosítás nem sikerült."); }
    finally { setBusy(""); }
  }
  async function parseImportFile(file: File) {
    const parsed = JSON.parse(await file.text());
    if (parsed?.format !== "budget-app-encrypted-backup") return parsed;
    if (!globalThis.crypto?.subtle) throw new Error("A titkosított backup importjához HTTPS vagy secure browser context szükséges.");
    if (!backupPassword) throw new Error("Ez titkosított backup. Add meg a backup-jelszót az importhoz.");
    const salt = base64ToBytes(parsed.salt), iv = base64ToBytes(parsed.iv), cipher = base64ToBytes(parsed.ciphertext);
    const key = await deriveBackupKey(backupPassword, salt, ["decrypt"]);
    let clear: ArrayBuffer;
    try { clear = await crypto.subtle.decrypt({ name:"AES-GCM", iv }, key, cipher); }
    catch { throw new Error("A backup-jelszó hibás, vagy a titkosított fájl sérült."); }
    return JSON.parse(new TextDecoder().decode(clear));
  }

  async function prepareImportSource(parsed: any) {
    const serialized = JSON.stringify(parsed);
    if (new TextEncoder().encode(serialized).byteLength < 3 * 1024 * 1024) return parsed;
    try {
      const { upload } = await import("@vercel/blob/client");
      const pathname = `backups/import/${dataSpaceId}/pending.json`;
      const blob = await upload(pathname, new Blob([serialized], { type: "application/json" }), { access:"private", handleUploadUrl:"/api/backup/upload", multipart:true, allowOverwrite:true });
      return { blobUrl: blob.url };
    } catch {
      // Local development has no Vercel Blob and can still post the JSON directly.
      return parsed;
    }
  }

  async function previewImport() {
    if (!importFile) return;
    setBusy("preview"); setImportStatus(""); setPreview(null); setBackup(null);
    try {
      const parsed = await parseImportFile(importFile);
      const source = await prepareImportSource(parsed);
      const response = await fetch("/api/backup/import/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(source) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "A backup nem olvasható.");
      setBackup(source); setPreview(body);
    } catch (error) { setImportStatus(error instanceof Error ? error.message : "A backup nem olvasható."); }
    finally { setBusy(""); }
  }

  async function runImport(mode: "replace" | "merge") {
    if (!backup) return;
    if (mode === "replace" && !window.confirm("Ez lecseréli a jelenlegi pénzügyi adatokat a backup tartalmára. A belépési email és jelszó megmarad. Folytatod?")) return;
    setBusy(mode); setImportStatus("");
    const response = await fetch("/api/backup/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, source: backup }) });
    const body = await response.json().catch(()=>({}));
    setBusy("");
    if (!response.ok) return setImportStatus(body.error || "Az import nem sikerült.");
    if (mode === "merge") setImportStatus(`Merge kész: ${body.created ?? 0} új rekord, ${body.skipped ?? 0} változatlan, ${(body.conflicts ?? []).length} konfliktus.`);
    else setImportStatus("A backup visszaállítása elkészült.");
    router.refresh();
  }

  return <div className="settings-grid">
    <section className="panel settings-panel">
      <div className="eyebrow">Fiók</div><h2>Bejelentkezés és biztonság</h2>
      <div className="settings-kv"><span>Email</span><strong>{email}</strong></div>
      <form onSubmit={changePassword} className="settings-form">
        <div className="field"><label>Jelenlegi jelszó</label><input className="input" name="currentPassword" type="password" required autoComplete="current-password"/></div>
        <div className="settings-two-col"><div className="field"><label>Új jelszó</label><input className="input" name="newPassword" type="password" minLength={10} required autoComplete="new-password"/></div><div className="field"><label>Új jelszó újra</label><input className="input" name="confirmPassword" type="password" minLength={10} required autoComplete="new-password"/></div></div>
        <button className="primary" disabled={busy==="password"}>{busy==="password"?"Mentés…":"Jelszó módosítása"}</button>
        {passwordStatus&&<p className="settings-status">{passwordStatus}</p>}
      </form>
    </section>

    <section className="panel settings-panel">
      <div className="eyebrow">AI</div><h2>Blokkfelismerési modell</h2><p className="muted">A választás a fiókodhoz tartozik, ezért minden eszközöd ugyanazt a modellt használja.</p>
      <div className="model-choice">
        {[{id:"gemini-3.5-flash",title:"Gemini 3.5 Flash",text:"Jelenleg jó alapértelmezés blokkfelismeréshez."},{id:"gemini-3.6-flash",title:"Gemini 3.6 Flash",text:"Újabb modell, a free-tier kvóta projektenként eltérhet."}].map(option=><button key={option.id} type="button" className={`model-card ${model===option.id?"selected":""}`} onClick={()=>saveModel(option.id)}><span><strong>{option.title}</strong><small>{option.text}</small></span><i>{model===option.id?"✓":""}</i></button>)}
      </div>{modelStatus&&<p className="settings-status">{modelStatus}</p>}
    </section>

    <section className="panel settings-panel settings-wide">
      <div className="eyebrow">Multi-device</div><h2>Központi adatbázis</h2><p className="muted">Az online telepítés ugyanazt a PostgreSQL adatbázist használja telefonon és számítógépen. Productionben a draft blokkfotók privát Vercel Blob tárhelyen lehetnek, helyi fejlesztésben pedig PostgreSQL-ben. Mindkét mód ugyanahhoz a fiókhoz kötődik, ezért nem egyetlen eszköz fájlrendszerétől függ.</p>
      <div className="settings-kv"><span>Adattér azonosító</span><code>{dataSpaceId}</code></div>
      <div className="info-strip">Productionben a nyilvános regisztráció alapból zárt. A szerverhez csak a saját fiókoddal kell belépned, hacsak külön nem engedélyezed a regisztrációt.</div>
    </section>

    <section className="panel settings-panel settings-wide">
      <div className="eyebrow">Backup és export</div><h2>Adatok mozgatása és jelentések</h2>
      <div className="export-actions">
        <a className="secondary button-link" href="/api/backup/export">JSON backup</a>
        <a className="secondary button-link" href="/api/backup/export?images=1">Teljes backup képekkel</a>
        <a className="secondary button-link" href="/api/export/transactions">CSV tranzakciók</a><a className="secondary button-link" href="/api/export/transactions/xlsx">XLSX tranzakciók</a>
        <a className="primary button-link" href="/app/reports">Nyomtatható jelentés / PDF</a>
      </div>
      <p className="muted export-note">A JSON backup nem tartalmaz jelszót vagy sessiont. A képes változat a még nyitott draft blokkfotókat is beágyazza, ezért érzékenyebb és nagyobb fájl.</p>
      <div className="encrypted-backup-row"><div className="field"><label>Backup-jelszó</label><input className="input" type="password" value={backupPassword} onChange={e=>setBackupPassword(e.target.value)} minLength={10} placeholder="Legalább 10 karakter" autoComplete="new-password"/></div><button className="secondary" type="button" disabled={busy==="encrypt"} onClick={downloadEncryptedBackup}>{busy==="encrypt"?"Titkosítás…":"Titkosított teljes backup"}</button></div>
      <div className="import-box">
        <div><strong>Backup import</strong><p className="muted">Először csak ellenőrizzük a fájlt. Restore lecseréli a jelenlegi adatokat, Merge pedig csak ugyanazon adattérből származó mentésnél engedélyezett és nem ír felül konfliktust csendben.</p></div>
        <div className="import-controls"><input className="input" type="file" accept="application/json,.json,.budgetenc" onChange={e=>{setImportFile(e.target.files?.[0]||null);setPreview(null);setBackup(null);setImportStatus("")}}/><button className="secondary" type="button" disabled={!importFile||busy==="preview"} onClick={previewImport}>{busy==="preview"?"Ellenőrzés…":"Preview"}</button></div>
        {preview&&<div className="backup-preview"><div><strong>Backup {preview.appVersion}</strong><span>{new Date(preview.exportedAt).toLocaleString("hu-HU")}</span></div><div className="backup-counts">{previewCounts.map(([key,value])=><span key={key}><b>{value}</b>{key}</span>)}</div><div className="backup-mode-note">{preview.sameDataSpace?"Ugyanahhoz az adattérhez tartozik: Restore és Merge is használható.":"Másik adattérből származik: első költöztetéshez Restore / csere szükséges."}</div><div className="export-actions"><button className="secondary" type="button" disabled={Boolean(busy)} onClick={()=>runImport("merge")}>Merge</button><button className="danger-button" type="button" disabled={Boolean(busy)} onClick={()=>runImport("replace")}>Restore / csere</button></div></div>}
        {importStatus&&<p className="settings-status">{importStatus}</p>}
      </div>
    </section>
  </div>;
}
