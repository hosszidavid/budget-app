import { normalizeReceiptLabel, normalizeText } from "./text";

export type StructureComponent = {
  rawLabel: string;
  label: string;
  amount: number;
  reusableItemId: string | null;
  categoryId: string | null;
  categoryPath: string;
  source: "AI" | "MAPPING" | "MANUAL";
  confidence: number | null;
  isDairy: boolean;
  containsEgg: boolean;
  containsAnimal: boolean;
  isAlcohol: boolean;
  isFrozen: boolean;
  isCanned: boolean;
  isPackaged: boolean;
};

export type StructuredReceiptLine = StructureComponent & {
  components: StructureComponent[];
};

export type StructureRule = {
  merchantNormalized: string;
  signature: string;
  action: "MERGE" | "SPLIT";
  components: unknown;
  targetLabel: string | null;
  targetCategoryId: string | null;
  targetReusableItemId: string | null;
  updatedAt: Date;
};

export function normalizeStructureToken(value: string) {
  return normalizeReceiptLabel(value) || normalizeText(value);
}

export function structureSignature(rawLabels: string[]) {
  return rawLabels
    .map(normalizeStructureToken)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .join("||");
}

export function lineSignature(line: StructuredReceiptLine) {
  return structureSignature((line.components?.length ? line.components : [line]).map(c => c.rawLabel));
}

function cloneComponent(component: StructureComponent): StructureComponent {
  return { ...component };
}

function mergedLine(lines: StructuredReceiptLine[], target?: Partial<StructuredReceiptLine>): StructuredReceiptLine {
  const components = lines.flatMap(line => (line.components?.length ? line.components : [line]).map(cloneComponent));
  const first = lines[0];
  const amount = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  return {
    rawLabel: components.map(c => c.rawLabel).filter(Boolean).join(" + "),
    label: target?.label ?? first.label,
    amount,
    reusableItemId: target?.reusableItemId ?? first.reusableItemId,
    categoryId: target?.categoryId ?? first.categoryId,
    categoryPath: target?.categoryPath ?? first.categoryPath,
    source: target?.source ?? (lines.every(l => l.source === "MAPPING") ? "MAPPING" : "AI"),
    confidence: target?.confidence ?? Math.min(...lines.map(l => l.confidence ?? 0.5)),
    isDairy: lines.some(l => l.isDairy),
    containsEgg: lines.some(l => l.containsEgg),
    containsAnimal: lines.some(l => l.containsAnimal),
    isAlcohol: lines.some(l => l.isAlcohol),
    isFrozen: lines.some(l => l.isFrozen),
    isCanned: lines.some(l => l.isCanned),
    isPackaged: lines.some(l => l.isPackaged),
    components,
  };
}

function activeRules(rules: StructureRule[], merchantNormalized: string) {
  const map = new Map<string, StructureRule>();
  const relevant = rules
    .filter(r => r.merchantNormalized === merchantNormalized || r.merchantNormalized === "*")
    .sort((a, b) => {
      const aSpecific = a.merchantNormalized === merchantNormalized ? 1 : 0;
      const bSpecific = b.merchantNormalized === merchantNormalized ? 1 : 0;
      if (aSpecific !== bSpecific) return bSpecific - aSpecific;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
  for (const rule of relevant) if (!map.has(rule.signature)) map.set(rule.signature, rule);
  return map;
}

/**
 * Applies explicit user structure rules first, then keeps the existing useful
 * default behavior of merging equal budget labels/categories. A remembered
 * SPLIT rule prevents that automatic merge for the exact component set.
 */
export function applyReceiptStructureRules(
  input: StructuredReceiptLine[],
  rules: StructureRule[],
  merchantNormalized: string,
  categoryPathById: Map<string, string>,
) {
  let working = input.map(line => ({ ...line, components: line.components?.length ? line.components.map(cloneComponent) : [cloneComponent(line)] }));
  const ruleMap = activeRules(rules, merchantNormalized);

  // Explicit MERGE rules may join lines even when their AI labels/categories differ.
  const mergeRules = [...ruleMap.values()].filter(r => r.action === "MERGE");
  for (const rule of mergeRules) {
    const wanted = Array.isArray(rule.components) ? (rule.components as unknown[]).map(v => normalizeStructureToken(String(v))) : [];
    if (wanted.length < 2) continue;
    const picked: number[] = [];
    const used = new Set<number>();
    for (const token of wanted) {
      const idx = working.findIndex((line, index) => !used.has(index) && line.components.length === 1 && normalizeStructureToken(line.components[0].rawLabel) === token);
      if (idx < 0) { picked.length = 0; break; }
      picked.push(idx); used.add(idx);
    }
    if (picked.length !== wanted.length) continue;
    const selected = picked.map(i => working[i]);
    const firstIndex = Math.min(...picked);
    const next = working.filter((_, i) => !used.has(i));
    const merged = mergedLine(selected, {
      label: rule.targetLabel || selected[0].label,
      categoryId: rule.targetCategoryId,
      categoryPath: rule.targetCategoryId ? categoryPathById.get(rule.targetCategoryId) || "" : "",
      reusableItemId: rule.targetReusableItemId,
      source: "MAPPING",
      confidence: 1,
    });
    next.splice(firstIndex, 0, merged);
    working = next;
  }

  // Default merge by budget identity, unless the latest rule for that exact set says SPLIT.
  const groups = new Map<string, StructuredReceiptLine[]>();
  const order: string[] = [];
  for (const line of working) {
    const key = `${line.categoryId || ""}|${normalizeText(line.label)}`;
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key)!.push(line);
  }

  const result: StructuredReceiptLine[] = [];
  for (const key of order) {
    const group = groups.get(key)!;
    if (group.length === 1) { result.push(group[0]); continue; }
    const signature = structureSignature(group.flatMap(line => line.components.map(c => c.rawLabel)));
    const rule = ruleMap.get(signature);
    if (rule?.action === "SPLIT") result.push(...group);
    else result.push(mergedLine(group, rule?.action === "MERGE" ? {
      label: rule.targetLabel || group[0].label,
      categoryId: rule.targetCategoryId,
      categoryPath: rule.targetCategoryId ? categoryPathById.get(rule.targetCategoryId) || "" : group[0].categoryPath,
      reusableItemId: rule.targetReusableItemId,
      source: "MAPPING",
      confidence: 1,
    } : undefined));
  }
  return result;
}
