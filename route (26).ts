import { getCurrentUser } from "@/lib/auth";
import { monthBaseFlow, monthBounds, previousClosing } from "@/lib/finance";
import { resolveFx } from "@/lib/fx";
import { prisma } from "@/lib/prisma";
import { normalizeText } from "@/lib/text";
import { z } from "zod";

const entrySchema = z.object({
  personId: z.string().uuid().nullable().optional(),
  location: z.string().min(1).max(120),
  amount: z.number().min(0),
  currency: z.string().length(3),
});
const schema = z.object({
  year: z.number().int().min(2000).max(2200),
  month: z.number().int().min(1).max(12),
  manualOpeningBase: z.number().nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  close: z.boolean().default(false),
  entries: z.array(entrySchema).max(100),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Érvénytelen havi zárási adatok." }, { status: 400 });
  const d = parsed.data;
  const personIds = [...new Set(d.entries.map(x => x.personId).filter((x): x is string => Boolean(x)))];
  if (personIds.length) {
    const count = await prisma.person.count({ where: { userId: user.id, id: { in: personIds }, archivedAt: null } });
    if (count !== personIds.length) return Response.json({ error: "Ismeretlen személy a zárásban." }, { status: 400 });
  }

  const flow = await monthBaseFlow(user.id, d.year, d.month);
  const previous = await previousClosing(user.id, d.year, d.month);
  const opening = d.manualOpeningBase ?? previous?.actual ?? 0;
  const expected = opening + flow.incomeBase - flow.expenseBase;
  const { closingDate } = monthBounds(d.year, d.month);

  const prepared = [] as Array<{ personId: string | null; label: string; locationId: string; amount: number; currency: string; fxRate: number | null; fxDate: Date | null; fxSource: string; baseAmount: number | null }>;
  for (const row of d.entries) {
    const label = row.location.trim();
    const normalized = normalizeText(label);
    const location = await prisma.balanceLocation.upsert({
      where: { userId_normalized: { userId: user.id, normalized } },
      update: { name: label, archivedAt: null },
      create: { userId: user.id, name: label, normalized },
    });
    const fx = await resolveFx(row.amount, row.currency, user.baseCurrency, closingDate);
    prepared.push({ personId: row.personId ?? null, label, locationId: location.id, amount: row.amount, currency: row.currency.toUpperCase(), fxRate: fx?.rate ?? null, fxDate: fx?.date ?? null, fxSource: fx?.source ?? "pending", baseAmount: fx?.baseAmount ?? null });
  }

  const snapshot = await prisma.$transaction(async tx => {
    const snap = await tx.monthSnapshot.upsert({
      where: { userId_year_month: { userId: user.id, year: d.year, month: d.month } },
      update: {
        manualOpeningBase: d.manualOpeningBase ?? null,
        note: d.note?.trim() || null,
        closedAt: d.close ? new Date() : undefined,
        expectedAtClose: d.close ? expected : undefined,
      },
      create: {
        userId: user.id, year: d.year, month: d.month, manualOpeningBase: d.manualOpeningBase ?? null, note: d.note?.trim() || null,
        closedAt: d.close ? new Date() : null, expectedAtClose: d.close ? expected : null,
      },
    });
    await tx.balanceEntry.deleteMany({ where: { snapshotId: snap.id } });
    if (prepared.length) await tx.balanceEntry.createMany({ data: prepared.map(row => ({ snapshotId: snap.id, ...row })) });
    return snap;
  });

  const actual = prepared.reduce((sum, row) => sum + Number(row.baseAmount ?? 0), 0);
  const missingFx = flow.missingFx + prepared.filter(row => row.baseAmount == null).length;
  return Response.json({ ok: true, id: snapshot.id, opening, expected, actual, difference: actual - expected, missingFx });
}
