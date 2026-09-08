/**
 * Item + category autocomplete endpoint.
 *
 * Role:
 * - Keeps the item-first entry flow useful even when a category does not have a
 *   dedicated ReusableItem row (notably the many "Egyéb ..." categories).
 * - Returns remembered items first, then matching category nodes as selectable
 *   fallbacks.
 * - Every query is scoped to the authenticated user.
 */
import { getCurrentUser } from "@/lib/auth";
import { buildCategoryPath } from "@/lib/categories";
import { normalizeText } from "@/lib/text";
import { prisma } from "@/lib/prisma";

type Suggestion = {
  id: string;
  name: string;
  categoryId: string | null;
  categoryPath: string;
  defaults: Record<string, boolean>;
  source: "ITEM" | "CATEGORY";
  usageCount: number;
  lastUsedAt: Date | null;
};

function relevance(name: string, q: string) {
  const normalized = normalizeText(name);
  if (normalized === q) return 0;
  if (normalized.startsWith(q)) return 1;
  return 2;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });

  const url = new URL(request.url);
  const q = normalizeText(url.searchParams.get("q") ?? "");
  const kind = url.searchParams.get("kind") === "INCOME" ? "INCOME" : "EXPENSE";
  const categoryId = url.searchParams.get("categoryId");
  if (!q) return Response.json([]);

  const [items, categories] = await Promise.all([
    prisma.reusableItem.findMany({
      where: {
        userId: user.id,
        kind,
        archivedAt: null,
        normalized: { contains: q },
        ...(categoryId ? { categoryId } : {}),
      },
      orderBy: [{ usageCount: "desc" }, { lastUsedAt: "desc" }, { name: "asc" }],
      take: 18,
    }),
    prisma.categoryNode.findMany({
      where: { userId: user.id, kind, archivedAt: null },
      orderBy: [{ depth: "asc" }, { name: "asc" }],
    }),
  ]);

  const paths = new Map(categories.map(category => [category.id, buildCategoryPath(category.id, categories)]));
  const result: Suggestion[] = items.map(item => ({
    id: item.id,
    name: item.name,
    categoryId: item.categoryId,
    categoryPath: item.categoryId ? (paths.get(item.categoryId) ?? "") : "",
    defaults: {
      isDairy: item.isDairy,
      containsEgg: item.containsEgg,
      containsAnimal: item.containsAnimal,
      isAlcohol: item.isAlcohol,
      isFrozen: item.isFrozen,
      isCanned: item.isCanned,
      isPackaged: item.isPackaged,
    },
    source: "ITEM",
    usageCount: item.usageCount,
    lastUsedAt: item.lastUsedAt,
  }));

  // If the caller already fixed a category (e.g. income entry), preserve the
  // previous behavior and do not offer unrelated categories as pseudo-items.
  if (!categoryId) {
    for (const category of categories) {
      if (!category.normalized.includes(q)) continue;
      result.push({
        id: `category:${category.id}`,
        name: category.name,
        categoryId: category.id,
        categoryPath: paths.get(category.id) ?? category.name,
        defaults: {},
        source: "CATEGORY",
        usageCount: 0,
        lastUsedAt: null,
      });
    }
  }

  // The same terminal category can already exist as a reusable item. Prefer
  // the remembered item in that case, but keep same-name categories under
  // different paths so generic terms like "egyéb" remain fully discoverable.
  const deduped = new Map<string, Suggestion>();
  for (const suggestion of result) {
    const key = `${normalizeText(suggestion.name)}::${suggestion.categoryId ?? ""}`;
    const current = deduped.get(key);
    if (!current || (current.source === "CATEGORY" && suggestion.source === "ITEM")) {
      deduped.set(key, suggestion);
    }
  }

  const sorted = [...deduped.values()]
    .sort((a, b) => {
      const rel = relevance(a.name, q) - relevance(b.name, q);
      if (rel) return rel;
      if (a.source !== b.source) return a.source === "ITEM" ? -1 : 1;
      if (a.usageCount !== b.usageCount) return b.usageCount - a.usageCount;
      const aTime = a.lastUsedAt?.getTime() ?? 0;
      const bTime = b.lastUsedAt?.getTime() ?? 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.categoryPath.localeCompare(b.categoryPath, "hu");
    })
    .slice(0, 24);

  return Response.json(sorted.map(({ source, usageCount, lastUsedAt, ...suggestion }) => ({ ...suggestion, source })));
}
