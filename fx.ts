/**
 * Daily FX conversion into the user's base currency.
 * Provider: Frankfurter public API (ECB-backed daily reference rates).
 * We walk backwards for weekends/holidays and persist the exact rate/date used,
 * so historical totals never silently change later.
 */
export type FxResult = {
  rate: number;
  date: Date;
  source: string;
  baseAmount: number;
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function atNoonUtc(iso: string) {
  return new Date(`${iso}T12:00:00Z`);
}

export async function resolveFx(amount: number, currency: string, baseCurrency: string, transactionDate: Date): Promise<FxResult | null> {
  const from = currency.toUpperCase();
  const to = baseCurrency.toUpperCase();
  if (from === to) return { rate: 1, date: transactionDate, source: "base", baseAmount: amount };

  const apiBase = process.env.FX_API_BASE || "https://api.frankfurter.dev/v1";
  for (let back = 0; back <= 7; back++) {
    const d = new Date(transactionDate);
    d.setUTCDate(d.getUTCDate() - back);
    const requested = isoDate(d);
    try {
      const url = `${apiBase}/${requested}?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`;
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok) continue;
      const json = await response.json() as { date?: string; rates?: Record<string, number> };
      const rate = Number(json.rates?.[to]);
      if (!Number.isFinite(rate) || rate <= 0) continue;
      const usedDate = atNoonUtc(json.date || requested);
      return { rate, date: usedDate, source: "Frankfurter/ECB", baseAmount: amount * rate };
    } catch {
      // Provider failure is non-destructive. The transaction can be saved with FX pending.
    }
  }
  return null;
}
