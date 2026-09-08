export function normalizeText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("hu-HU")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/** Normalizes volatile receipt suffixes so the same store label can be learned across weights, quantities and prices. */
export function normalizeReceiptLabel(value: string) {
  return normalizeText(value)
    .replace(/\b\d+[.,]\d+\s?(kg|g|l|ml|cl|stk|st|pcs|x)\b/gi, " ")
    .replace(/\b\d+\s?(kg|g|l|ml|cl|stk|st|pcs)\b/gi, " ")
    .replace(/\b\d+\s?[x×]\s?/gi, " ")
    .replace(/\b\d+[.,]\d{2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
