"use client";

import { monthNames } from "@/lib/month";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  basePath?: string;
  mode: "month" | "year" | "custom";
  year: number;
  month: number;
  from: string;
  to: string;
};

export function PeriodNavigator({ basePath = "/app", mode, year, month, from, to }: Props) {
  const router = useRouter();
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  function goMonth(nextYear: number, nextMonth: number) {
    router.push(`${basePath}?mode=month&year=${nextYear}&month=${nextMonth}`);
  }

  function moveMonth(delta: number) {
    const date = new Date(year, month - 1 + delta, 1);
    goMonth(date.getFullYear(), date.getMonth() + 1);
  }

  function moveYear(delta: number) {
    router.push(`${basePath}?mode=year&year=${year + delta}`);
  }

  function setMode(next: "month" | "year" | "custom") {
    if (next === "month") return goMonth(year, month);
    if (next === "year") return router.push(`${basePath}?mode=year&year=${year}`);
    router.push(`${basePath}?mode=custom&from=${encodeURIComponent(customFrom)}&to=${encodeURIComponent(customTo)}`);
  }

  function applyCustom() {
    if (!customFrom || !customTo) return;
    router.push(`${basePath}?mode=custom&from=${encodeURIComponent(customFrom)}&to=${encodeURIComponent(customTo)}`);
  }

  return <div className="period-control">
    <div className="period-topline">
      <div className="period-tabs" role="tablist" aria-label="Időszak">
        <button className={mode === "month" ? "active" : ""} onClick={() => setMode("month")}>Hónap</button>
        <button className={mode === "year" ? "active" : ""} onClick={() => setMode("year")}>Év</button>
        <button className={mode === "custom" ? "active" : ""} onClick={() => setMode("custom")}>Egyedi</button>
      </div>

      {mode !== "custom" && <div className="period-stepper">
        <button aria-label="Előző időszak" onClick={() => mode === "year" ? moveYear(-1) : moveMonth(-1)}>‹</button>
        <div>{mode === "year" ? year : `${monthNames[month - 1]} ${year}`}</div>
        <button aria-label="Következő időszak" onClick={() => mode === "year" ? moveYear(1) : moveMonth(1)}>›</button>
      </div>}
    </div>

    {mode === "custom" && <div className="custom-period">
      <label><span>Tól</span><input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} /></label>
      <span className="range-arrow">→</span>
      <label><span>Ig</span><input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} /></label>
      <button className="period-apply" onClick={applyCustom}>Alkalmaz</button>
    </div>}
  </div>;
}
