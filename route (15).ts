import { getCurrentUser } from "@/lib/auth";
import { resolveFx } from "@/lib/fx";
import { prisma } from "@/lib/prisma";
import { normalizeText } from "@/lib/text";
import { z } from "zod";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  personId: z.string().uuid(),
  label: z.string().max(180).nullable().optional(),
  categoryId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().length(3),
  note: z.string().max(2000).nullable().optional(),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.incomeEntry.findFirst({ where: { id, userId: user.id, deletedAt: null } });
  if (!existing) return Response.json({ error: "A bevétel nem található." }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Érvénytelen bevételi adatok." }, { status: 400 });
  const d = parsed.data;
  const [person, category] = await Promise.all([
    prisma.person.findFirst({ where: { id: d.personId, userId: user.id, archivedAt: null } }),
    prisma.categoryNode.findFirst({ where: { id: d.categoryId, userId: user.id, kind: "INCOME", archivedAt: null } }),
  ]);
  if (!person) return Response.json({ error: "Ismeretlen személy." }, { status: 400 });
  if (!category) return Response.json({ error: "A bevételi kategória kötelező." }, { status: 400 });

  const label = d.label?.trim() || category.name;
  const txDate = new Date(`${d.date}T12:00:00Z`);
  const fx = await resolveFx(d.amount, d.currency, user.baseCurrency, txDate);
  await prisma.$transaction(async tx => {
    if (d.label?.trim()) {
      const normalized = normalizeText(label);
      await tx.reusableItem.upsert({
        where: { userId_kind_normalized: { userId: user.id, kind: "INCOME", normalized } },
        update: { name: label, categoryId: category.id, lastUsedAt: new Date(), archivedAt: null },
        create: { userId: user.id, kind: "INCOME", name: label, normalized, categoryId: category.id, usageCount: 1, lastUsedAt: new Date() },
      });
    }
    await tx.incomeEntry.update({
      where: { id },
      data: {
        personId: d.personId, categoryId: category.id, date: txDate, label,
        amount: d.amount, currency: d.currency.toUpperCase(), note: d.note?.trim() || null,
        fxRate: fx?.rate ?? null, fxDate: fx?.date ?? null, fxSource: fx?.source ?? "pending", baseAmount: fx?.baseAmount ?? null,
      },
    });
  });
  return Response.json({ ok: true, id });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.incomeEntry.findFirst({ where: { id, userId: user.id, deletedAt: null } });
  if (!existing) return Response.json({ error: "A bevétel nem található." }, { status: 404 });
  await prisma.incomeEntry.update({ where: { id }, data: { deletedAt: new Date() } });
  return Response.json({ ok: true });
}
