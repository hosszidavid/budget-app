import { normalizeText } from "./text";
import type { StructuredReceiptLine } from "./receipt-structure";

type KnownCategory = { id: string; path: string };
type KnownItem = { id: string; name: string; categoryId: string | null; categoryPath: string };

export type RecognizedReceiptLine = StructuredReceiptLine;
export type RecognizedReceipt = {
  merchant: string;
  date: string;
  currency: string;
  declaredTotal: number;
  lines: RecognizedReceiptLine[];
  model: string;
  api: "interactions";
};

const receiptSchema = {
  type: "object",
  additionalProperties: false,
  required: ["merchant", "date", "currency", "declaredTotal", "lines"],
  properties: {
    merchant: { type: "string" },
    date: { type: "string" },
    currency: { type: "string" },
    declaredTotal: { type: "number" },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["rawLabel", "label", "amount", "categoryPath", "confidence", "isDairy", "containsEgg", "containsAnimal", "isAlcohol", "isFrozen", "isCanned", "isPackaged"],
        properties: {
          rawLabel: { type: "string" },
          label: { type: "string" },
          amount: { type: "number" },
          categoryPath: { type: "string" },
          confidence: { type: "number" },
          isDairy: { type: "boolean" },
          containsEgg: { type: "boolean" },
          containsAnimal: { type: "boolean" },
          isAlcohol: { type: "boolean" },
          isFrozen: { type: "boolean" },
          isCanned: { type: "boolean" },
          isPackaged: { type: "boolean" },
        },
      },
    },
  },
};

function extractInteractionText(payload: any) {
  const texts: string[] = [];
  for (const step of Array.isArray(payload?.steps) ? payload.steps : []) {
    if (step?.type !== "model_output") continue;
    for (const content of Array.isArray(step?.content) ? step.content : []) if (content?.type === "text" && typeof content.text === "string") texts.push(content.text);
  }
  return texts.join("").trim();
}

export async function recognizeReceiptWithGemini(args: {
  bytes: Buffer;
  mimeType: string;
  categories: KnownCategory[];
  items: KnownItem[];
  model?: string;
}): Promise<RecognizedReceipt> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Nincs beállítva GOOGLE_AI_STUDIO_API_KEY a .env fájlban.");
  const model = args.model || process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const categoryList = args.categories.map(c => `- ${c.path}`).join("\n");
  const itemList = args.items.slice(0, 350).map(i => `- ${i.name} => ${i.categoryPath || "nincs kategória"}`).join("\n");
  const prompt = `You are extracting a grocery/retail receipt for a personal budget application.\n\nRules:\n1. Read merchant, receipt date, currency, receipt final total, and purchasable line items.\n2. Preserve receipt mathematics. Discounts, coupons and loyalty savings must be returned as their own NEGATIVE lines using an allowed path under \"Korrekciók › Kedvezmény\". Deposit/Pfand charges are positive under \"Korrekciók › Pfand / betétdíj › Betétdíj\"; bottle/deposit returns are negative under \"Korrekciók › Pfand / betétdíj › Visszaváltás\". Do not hide these adjustments inside nearby products.\n3. Preserve the printed abbreviated name in rawLabel. You MAY assign several printed products to the same generic budget label when that is semantically useful. The application itself decides whether equal budget labels should be shown merged or split.\n4. Budget labels should be generic, e.g. APFEL GALA and PINK LADY both become Alma. Do not retain brand/variety unless necessary to understand the item.\n5. categoryPath must be exactly one of the allowed category paths below, or empty string when uncertain.\n6. confidence is 0..1. Lower confidence when receipt text or categorization is uncertain.\n7. Boolean food attributes may be inferred conservatively. Packaged means sold as a packaged product, not merely put in a shopping bag.\n8. Amount is signed: positive for purchases/deposit charges, negative for discounts/coupons/deposit returns. Never emit zero.\n\nAllowed category paths:\n${categoryList}\n\nKnown reusable items (prefer these labels when applicable):\n${itemList || "none"}`;

  const timeoutMs = Math.max(10_000, Math.min(600_000, Number(process.env.RECEIPT_AI_TIMEOUT_MS || 240_000)));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
        "Api-Revision": "2026-05-20",
      },
      body: JSON.stringify({
        model,
        input: [
          { type: "text", text: prompt },
          { type: "image", data: args.bytes.toString("base64"), mime_type: args.mimeType, resolution: "high" },
        ],
        response_format: { type: "text", mime_type: "application/json", schema: receiptSchema },
        store: false,
        background: false,
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error(`A Gemini felismerés túllépte a ${Math.round(timeoutMs / 1000)} másodperces időkorlátot. Próbáld újra a blokkot.`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gemini Interactions API hiba (${response.status})${detail ? `: ${detail.slice(0, 500)}` : ""}`);
  }
  const payload = await response.json() as any;
  if (payload?.status && payload.status !== "completed") throw new Error(`A Gemini felismerés nem fejeződött be (állapot: ${payload.status}).`);
  const text = extractInteractionText(payload);
  if (!text) throw new Error("A Gemini Interactions API nem adott vissza feldolgozható szöveget.");
  let raw: any;
  try { raw = JSON.parse(text); }
  catch { throw new Error("A Gemini strukturált válasza nem érvényes JSON."); }
  if (!raw || !Array.isArray(raw.lines)) throw new Error("A Gemini válasza nem érvényes blokkstruktúra.");

  const pathMap = new Map(args.categories.map(c => [normalizeText(c.path), c]));
  const itemMap = new Map(args.items.map(i => [normalizeText(i.name), i]));
  const resultLines: RecognizedReceiptLine[] = [];
  for (const line of raw.lines.slice(0, 200)) {
    const amount = Number(line.amount);
    const rawLabel = String(line.rawLabel || line.label || "").trim();
    const labelFromAi = String(line.label || rawLabel).trim();
    if (!rawLabel || !labelFromAi || !Number.isFinite(amount) || amount === 0) continue;
    const reusable = itemMap.get(normalizeText(labelFromAi));
    const category = reusable?.categoryId ? args.categories.find(c => c.id === reusable.categoryId) : pathMap.get(normalizeText(String(line.categoryPath || "")));
    const component = {
      rawLabel,
      label: reusable?.name || labelFromAi,
      amount,
      categoryId: reusable?.categoryId || category?.id || null,
      categoryPath: reusable?.categoryPath || category?.path || "",
      reusableItemId: reusable?.id || null,
      confidence: Math.max(0, Math.min(1, Number(line.confidence) || 0.5)),
      source: "AI" as const,
      isDairy: !!line.isDairy,
      containsEgg: !!line.containsEgg,
      containsAnimal: !!line.containsAnimal,
      isAlcohol: !!line.isAlcohol,
      isFrozen: !!line.isFrozen,
      isCanned: !!line.isCanned,
      isPackaged: !!line.isPackaged,
    };
    resultLines.push({ ...component, components: [{ ...component }] });
  }

  return {
    merchant: String(raw.merchant || "").trim(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || "")) ? String(raw.date) : "",
    currency: /^[A-Za-z]{3}$/.test(String(raw.currency || "")) ? String(raw.currency).toUpperCase() : "CHF",
    declaredTotal: Number(raw.declaredTotal) > 0 ? Number(raw.declaredTotal) : 0,
    lines: resultLines,
    model,
    api: "interactions",
  };
}
