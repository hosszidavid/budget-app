"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function getCurrentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => setTheme(getCurrentTheme()), []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("budget-theme", next);
    setTheme(next);
  }

  return <button type="button" className={`theme-toggle ${compact ? "compact" : ""}`} onClick={toggle} aria-label={theme === "dark" ? "Világos téma" : "Sötét téma"} title={theme === "dark" ? "Világos téma" : "Sötét téma"}>
    <span className="theme-toggle-track"><span className="theme-toggle-thumb">{theme === "dark" ? "☾" : "☼"}</span></span>
    {!compact && <span>{theme === "dark" ? "Sötét" : "Világos"}</span>}
  </button>;
}
