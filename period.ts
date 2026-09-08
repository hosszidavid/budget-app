import { monthBounds, monthNames, parseYearMonth } from "./month";

export type PeriodMode = "month" | "year" | "custom";

export type PeriodSelection = {
  mode: PeriodMode;
  start: Date;
  end: Date;
  title: string;
  subtitle: string;
  year: number;
  month: number;
  from: string;
  to: string;
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function safeDate(raw?: string) {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parsePeriod(params: { mode?: string; year?: string; month?: string; from?: string; to?: string }): PeriodSelection {
  const mode: PeriodMode = params.mode === "year" || params.mode === "custom" ? params.mode : "month";
  const now = new Date();
  const { year, month } = parseYearMonth(params.year, params.month);

  if (mode === "year") {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    return {
      mode,
      start,
      end,
      title: `${year}`,
      subtitle: "Éves összesítő",
      year,
      month,
      from: isoDate(start),
      to: isoDate(new Date(end.getTime() - 86400000)),
    };
  }

  if (mode === "custom") {
    const fallbackFrom = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const fallbackTo = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0));
    let fromDate = safeDate(params.from) ?? fallbackFrom;
    let toDate = safeDate(params.to) ?? fallbackTo;
    if (toDate < fromDate) [fromDate, toDate] = [toDate, fromDate];
    const end = new Date(toDate.getTime() + 86400000);
    return {
      mode,
      start: fromDate,
      end,
      title: `${fromDate.toLocaleDateString("hu-HU")} – ${toDate.toLocaleDateString("hu-HU")}`,
      subtitle: "Egyedi időszak",
      year: fromDate.getUTCFullYear(),
      month: fromDate.getUTCMonth() + 1,
      from: isoDate(fromDate),
      to: isoDate(toDate),
    };
  }

  const { start, end } = monthBounds(year, month);
  return {
    mode,
    start,
    end,
    title: `${monthNames[month - 1]} ${year}`,
    subtitle: "Havi áttekintés",
    year,
    month,
    from: isoDate(start),
    to: isoDate(new Date(end.getTime() - 86400000)),
  };
}
