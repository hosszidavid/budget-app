import { getCurrentUser } from "@/lib/auth";
import { buildCategoryPath } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("mapping"),
    id: z.string().uuid(),
    label: z.string().min(1).max(180).optional(),
    categoryId: z.string().uuid().nullable().optional(),
    isDairy: z.boolean().optional(),
    containsEgg: z.boolean().optional(),
    containsAnimal: z.boolean().optional(),
    isAlcohol: z.boolean().optional(),
    isFrozen: z.boolean().optional(),
    isCanned: z.boolean().optional(),
    isPackaged: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("structure"),
    id: z.string().uuid(),
    action: z.enum(["MERGE", "SPLIT"]),
    targetLabel: z.string().min(1).max(180).nullable().optional(),
    targetCategoryId: z.string().uuid().nullable().optional(),
  }),
]);

const deleteSchema = z.object({ kind: z.enum(["mapping", "structure"]), id: z.string().uuid() });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const [categories, mappings, rules] = await Promise.all([
    prisma.categoryNode.findMany({ where: { userId: user.id, kind: "EXPENSE" }, orderBy: [{ depth: "asc" }, { name: "asc" }] }),
    prisma.receiptMapping.findMany({
      where: { userId: user.id },
      orderBy: [{ updatedAt: "desc" }, { usageCount: "desc" }],
      include: { reusableItem: { select: { name: true } }, category: { select: { id: true } } },
      take: 500,
    }),
    prisma.receiptStructureRule.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      include: { reusableItem: { select: { name: true } }, category: { select: { id: true } } },
      take: 500,
    }),
  ]);
  const pathById = new Map(categories.map(c => [c.id, buildCategoryPath(c.id, categories)]));
  return Response.json({
    mappings: mappings.map(m => ({
      id: m.id,
      merchantNormalized: m.merchantNormalized,
      rawNormalized: m.rawNormalized,
      label: m.label,
      reusableItemName: m.reusableItem?.name ?? null,
      categoryId: m.categoryId,
      categoryPath: m.categoryId ? pathById.get(m.categoryId) ?? "" : "",
      usageCount: m.usageCount,
      lastUsedAt: m.lastUsedAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
      isDairy: m.isDairy,
      containsEgg: m.containsEgg,
      containsAnimal: m.containsAnimal,
      isAlcohol: m.isAlcohol,
      isFrozen: m.isFrozen,
      isCanned: m.isCanned,
      isPackaged: m.isPackaged,
    })),
    structureRules: rules.map(r => ({
      id: r.id,
      merchantNormalized: r.merchantNormalized,
      signature: r.signature,
      action: r.action,
      components: Array.isArray(r.components) ? r.components : [],
      targetLabel: r.targetLabel,
      targetCategoryId: r.targetCategoryId,
      targetCategoryPath: r.targetCategoryId ? pathById.get(r.targetCategoryId) ?? "" : "",
      targetReusableItemName: r.reusableItem?.name ?? null,
      usageCount: r.usageCount,
      lastUsedAt: r.lastUsedAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Érvénytelen tanulási szabály." }, { status: 400 });
  const data = parsed.data;
  if (data.kind === "mapping") {
    const current = await prisma.receiptMapping.findFirst({ where: { id: data.id, userId: user.id } });
    if (!current) return Response.json({ error: "A mapping nem található." }, { status: 404 });
    if (data.categoryId && !await prisma.categoryNode.findFirst({ where: { id: data.categoryId, userId: user.id, kind: "EXPENSE", archivedAt: null } })) return Response.json({ error: "Ismeretlen kategória." }, { status: 400 });
    const nextLabel = data.label?.trim();
    await prisma.receiptMapping.update({ where: { id: current.id }, data: {
      label: nextLabel, reusableItemId: nextLabel && nextLabel !== current.label ? null : undefined, categoryId: data.categoryId,
      isDairy: data.isDairy, containsEgg: data.containsEgg, containsAnimal: data.containsAnimal,
      isAlcohol: data.isAlcohol, isFrozen: data.isFrozen, isCanned: data.isCanned, isPackaged: data.isPackaged,
      lastUsedAt: new Date(),
    }});
  } else {
    const current = await prisma.receiptStructureRule.findFirst({ where: { id: data.id, userId: user.id } });
    if (!current) return Response.json({ error: "A strukturális szabály nem található." }, { status: 404 });
    if (data.targetCategoryId && !await prisma.categoryNode.findFirst({ where: { id: data.targetCategoryId, userId: user.id, kind: "EXPENSE", archivedAt: null } })) return Response.json({ error: "Ismeretlen kategória." }, { status: 400 });
    await prisma.receiptStructureRule.update({ where: { id: current.id }, data: {
      action: data.action,
      targetLabel: data.targetLabel === undefined ? undefined : data.targetLabel?.trim() || null,
      targetCategoryId: data.targetCategoryId,
      lastUsedAt: new Date(),
    }});
  }
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Érvénytelen törlési kérés." }, { status: 400 });
  const { kind, id } = parsed.data;
  if (kind === "mapping") {
    const current = await prisma.receiptMapping.findFirst({ where: { id, userId: user.id } });
    if (!current) return Response.json({ error: "A mapping nem található." }, { status: 404 });
    await prisma.receiptMapping.delete({ where: { id } });
  } else {
    const current = await prisma.receiptStructureRule.findFirst({ where: { id, userId: user.id } });
    if (!current) return Response.json({ error: "A strukturális szabály nem található." }, { status: 404 });
    await prisma.receiptStructureRule.delete({ where: { id } });
  }
  return Response.json({ ok: true });
}
