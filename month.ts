export const monthNames = [
  "Január", "Február", "Március", "Április", "Május", "Június",
  "Július", "Augusztus", "Szeptember", "Október", "November", "December",
];

export function monthBounds(year: number, month: number) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)),
    end: new Date(Date.UTC(year, month, 1, 0, 0, 0)),
  };
}

export function parseYearMonth(yearRaw?: string, monthRaw?: string) {
  const now = new Date();
  const year = Number(yearRaw) || now.getFullYear();
  const month = Math.min(12, Math.max(1, Number(monthRaw) || now.getMonth() + 1));
  return { year, month };
}
