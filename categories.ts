import { CategoryNode } from "@prisma/client";

export type CategoryFlat = Pick<CategoryNode, "id" | "name" | "parentId" | "depth" | "color">;

export function buildCategoryPath(categoryId: string | null | undefined, categories: CategoryFlat[]) {
  if (!categoryId) return "Nincs kategorizálva";
  const byId = new Map(categories.map((c) => [c.id, c]));
  const parts: string[] = [];
  let current = byId.get(categoryId);
  let guard = 0;
  while (current && guard < 4) {
    parts.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
    guard += 1;
  }
  return parts.join(" › ");
}

export function rootColor(categoryId: string | null | undefined, categories: CategoryFlat[]) {
  if (!categoryId) return "#D2D3D5";
  const byId = new Map(categories.map((c) => [c.id, c]));
  let current = byId.get(categoryId);
  let guard = 0;
  while (current?.parentId && guard < 4) {
    current = byId.get(current.parentId);
    guard += 1;
  }
  return current?.color ?? "#D2D3D5";
}

export type AmountBehavior = "NORMAL" | "NEGATIVE" | "POSITIVE";

export function applyAmountBehavior(amount: number, behavior: AmountBehavior | null | undefined) {
  if (behavior === "NEGATIVE") return -Math.abs(amount);
  if (behavior === "POSITIVE") return Math.abs(amount);
  return amount;
}
