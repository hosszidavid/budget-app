"use client";

import { monthNames } from "@/lib/month";
import { useRouter } from "next/navigation";

export function MonthNavigator({ year, month }: { year: number; month: number }) {
  const router = useRouter();
  function move(delta: number) {
    const date = new Date(year, month - 1 + delta, 1);
    router.push(`/app?year=${date.getFullYear()}&month=${date.getMonth() + 1}`);
  }
  return <div className="month-nav">
    <button onClick={() => move(-1)} aria-label="Előző hónap">‹</button>
    <div className="month-label">{monthNames[month - 1]} {year}</div>
    <button onClick={() => move(1)} aria-label="Következő hónap">›</button>
  </div>;
}
