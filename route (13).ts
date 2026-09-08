import { getCurrentUser } from "@/lib/auth";
import { normalizeText } from "@/lib/text";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  kind: z.enum(["EXPENSE", "INCOME"]),
  name: z.string().trim().min(1).max(120),
  parentId: z.string().uuid().nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  createReusableItem: z.boolean().default(false),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  archived: z.boolean().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

const deleteSchema = z.object({ id: z.string().uuid() });

async function subtreeIds(userId: string, rootId: string) {
  const all = await prisma.categoryNode.findMany({
    where: { userId },
    select: { id: true, parentId: true },
  });
  const children = new Map<string, string[]>();
  for (const node of all) {
    if (!node.parentId) continue;
    const list = children.get(node.parentId) ?? [];
    list.push(node.id);
    children.set(node.parentId, list);
  }
  const result: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    result.push(id);
    stack.push(...(children.get(id) ?? []));
  }
  return result;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Érvénytelen kategóriaadatok." }, { status: 400 });
  const data = parsed.data;

  let depth = 1;
  let inheritedColor: string | null = data.color ?? null;
  if (data.parentId) {
    const parent = await prisma.categoryNode.findFirst({
      where: { id: data.parentId, userId: user.id, kind: data.kind, archivedAt: null },
    });
    if (!parent) return Response.json({ error: "A szülőkategória nem található." }, { status: 400 });
    if (parent.depth >= 3) return Response.json({ error: "Maximum három kategóriaszint használható." }, { status: 400 });
    depth = parent.depth + 1;
    inheritedColor = data.color ?? parent.color;
  }

  const normalized = normalizeText(data.name);
  const duplicate = await prisma.categoryNode.findFirst({
    where: { userId: user.id, kind: data.kind, parentId: data.parentId ?? null, normalized },
  });
  if (duplicate) return Response.json({ error: "Ilyen nevű elem már létezik ezen a szinten." }, { status: 409 });
  try {
    const category = await prisma.$transaction(async (tx) => {
      const created = await tx.categoryNode.create({
        data: {
          userId: user.id,
          kind: data.kind,
          name: data.name,
          normalized,
          depth,
          parentId: data.parentId ?? null,
          color: inheritedColor,
        },
      });
      if (data.createReusableItem) {
        await tx.reusableItem.upsert({
          where: { userId_kind_normalized: { userId: user.id, kind: data.kind, normalized } },
          update: { name: data.name, categoryId: created.id, archivedAt: null },
          create: { userId: user.id, kind: data.kind, name: data.name, normalized, categoryId: created.id },
        });
      }
      return created;
    });
    return Response.json({ ok: true, id: category.id });
  } catch {
    return Response.json({ error: "Ilyen nevű elem már létezik ezen a szinten." }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Érvénytelen módosítás." }, { status: 400 });
  const data = parsed.data;
  const category = await prisma.categoryNode.findFirst({ where: { id: data.id, userId: user.id } });
  if (!category) return Response.json({ error: "A kategória nem található." }, { status: 404 });

  const normalized = data.name ? normalizeText(data.name) : undefined;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.categoryNode.update({
        where: { id: category.id },
        data: {
          name: data.name,
          normalized,
          color: data.color,
          archivedAt: data.archived === undefined ? undefined : data.archived ? new Date() : null,
        },
      });
      if (data.color) {
        const ids = await subtreeIds(user.id, category.id);
        await tx.categoryNode.updateMany({
          where: { id: { in: ids }, userId: user.id },
          data: { color: data.color },
        });
      }
      if (data.name) {
        await tx.reusableItem.updateMany({
          where: { userId: user.id, kind: category.kind, categoryId: category.id, normalized: category.normalized },
          data: { name: data.name, normalized },
        });
      }
      if (data.archived !== undefined) {
        const ids = await subtreeIds(user.id, category.id);
        await tx.categoryNode.updateMany({
          where: { id: { in: ids }, userId: user.id },
          data: { archivedAt: data.archived ? new Date() : null },
        });
        await tx.reusableItem.updateMany({
          where: { userId: user.id, categoryId: { in: ids } },
          data: { archivedAt: data.archived ? new Date() : null },
        });
      }
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "A módosítás nem hajtható végre, valószínűleg névütközés miatt." }, { status: 409 });
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Érvénytelen törlési kérés." }, { status: 400 });
  const category = await prisma.categoryNode.findFirst({ where: { id: parsed.data.id, userId: user.id } });
  if (!category) return Response.json({ error: "A kategória nem található." }, { status: 404 });

  const ids = await subtreeIds(user.id, category.id);
  const [expenseUsage, incomeUsage, reusableUsage] = await Promise.all([
    prisma.expenseItem.count({ where: { categoryId: { in: ids } } }),
    prisma.incomeEntry.count({ where: { categoryId: { in: ids } } }),
    prisma.reusableItem.count({ where: { categoryId: { in: ids }, usageCount: { gt: 0 } } }),
  ]);
  const used = expenseUsage + incomeUsage + reusableUsage > 0;

  if (used) {
    await prisma.$transaction([
      prisma.categoryNode.updateMany({ where: { id: { in: ids }, userId: user.id }, data: { archivedAt: new Date() } }),
      prisma.reusableItem.updateMany({ where: { userId: user.id, categoryId: { in: ids } }, data: { archivedAt: new Date() } }),
    ]);
    return Response.json({ ok: true, mode: "archived" });
  }

  await prisma.$transaction(async (tx) => {
    await tx.reusableItem.deleteMany({ where: { userId: user.id, categoryId: { in: ids } } });
    const nodes = await tx.categoryNode.findMany({ where: { id: { in: ids }, userId: user.id }, orderBy: { depth: "desc" } });
    for (const node of nodes) await tx.categoryNode.delete({ where: { id: node.id } });
  });
  return Response.json({ ok: true, mode: "deleted" });
}
