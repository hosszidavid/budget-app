export const currencies = ["CHF", "EUR", "HUF", "USD", "GBP"] as const;

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("hu-HU", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "HUF" ? 0 : 2,
  }).format(amount);
}

export function totalsByCurrency<T>(rows: T[], currency: (row: T) => string, amount: (row: T) => number) {
  const map = new Map<string, number>();
  for (const row of rows) map.set(currency(row), (map.get(currency(row)) ?? 0) + amount(row));
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}
