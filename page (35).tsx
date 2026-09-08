import { SettingsPanel } from "@/components/SettingsPanel";
import { requireUser } from "@/lib/auth";

export default async function SettingsPage() {
  const user = await requireUser();
  return <main className="page settings-page"><div className="page-head"><div><div className="eyebrow">Beállítások</div><h1 className="page-title">Fiók és adatkezelés</h1><p className="muted">Jelszó, AI modell, multi-device és hordozható adatmentések.</p></div></div><SettingsPanel email={user.email} geminiModel={user.geminiModel} dataSpaceId={user.dataSpaceId}/></main>;
}
