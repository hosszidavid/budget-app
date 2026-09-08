"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "./BrandMark";
import { ThemeToggle } from "./ThemeToggle";

type IconName = "overview" | "history" | "receipts" | "analytics" | "database" | "settings";

function NavIcon({ name }: { name: IconName }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "overview") return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>;
  if (name === "history") return <svg {...common}><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>;
  if (name === "receipts") return <svg {...common}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>;
  if (name === "analytics") return <svg {...common}><path d="M4 19V9M10 19V5M16 19v-7M22 19V3"/></svg>;
  if (name === "database") return <svg {...common}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>;
}

const nav: { href: string; label: string; icon: IconName }[] = [
  { href: "/app", label: "Áttekintés", icon: "overview" },
  { href: "/app/history", label: "Előzmények", icon: "history" },
  { href: "/app/receipts", label: "Blokkok", icon: "receipts" },
  { href: "/app/analytics", label: "Analitika", icon: "analytics" },
  { href: "/app/categories", label: "Adatbázis", icon: "database" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }

  return <div className="app-layout">
    <aside className="sidebar">
      <Link className="brand" href="/app"><BrandMark /><span className="brand-copy"><b>Budget</b><small>personal finance</small></span></Link>
      <nav className="side-nav">{nav.map(item => {
        const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
        return <Link className={active ? "active" : ""} href={item.href} key={item.href}><span className="nav-icon"><NavIcon name={item.icon}/></span><span>{item.label}</span></Link>;
      })}</nav>
      <div className="sidebar-foot">
        <button className="side-add" onClick={() => setOpen(true)}><span className="side-add-icon">＋</span><span>Új bevitel</span></button>
        <Link className="settings-link" href="/app/settings"><span className="nav-icon"><NavIcon name="settings"/></span><span>Beállítások</span></Link>
        <ThemeToggle />
        <button className="logout" onClick={logout}>Kilépés</button>
      </div>
    </aside>

    <div className="mobile-topbar">
      <Link className="brand compact" href="/app"><BrandMark compact /><span>Budget</span></Link>
      <div className="mobile-top-actions"><Link className="mobile-settings" href="/app/settings" aria-label="Beállítások"><NavIcon name="settings"/></Link><ThemeToggle compact /><button className="mobile-add" onClick={() => setOpen(true)}>＋</button></div>
    </div>
    <div className="app-content">{children}</div>

    <nav className="mobile-nav">{nav.map(item => {
      const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
      return <Link className={active ? "active" : ""} href={item.href} key={item.href}><span><NavIcon name={item.icon}/></span><small>{item.label}</small></Link>;
    })}</nav>

    {open && <><div className="sheet-backdrop" onClick={() => setOpen(false)} /><div className="sheet">
      <div className="sheet-handle" />
      <div className="sheet-kicker">Gyors bevitel</div>
      <div className="sheet-title">Mit szeretnél hozzáadni?</div>
      <div className="sheet-option-grid">
        <Link className="sheet-option expense-option" href="/app/add/expense" onClick={() => setOpen(false)}><b>−</b><span><strong>Kiadás</strong><small>Egy vagy több tétel</small></span><i>›</i></Link>
        <Link className="sheet-option income-option" href="/app/add/income" onClick={() => setOpen(false)}><b>+</b><span><strong>Bevétel</strong><small>Személy és kategória</small></span><i>›</i></Link>
        <Link className="sheet-option receipt-option" href="/app/add/receipt" onClick={() => setOpen(false)}><b>⌁</b><span><strong>Blokk</strong><small>AI felismerés és review</small></span><i>›</i></Link>
      </div>
    </div></>}
  </div>;
}
