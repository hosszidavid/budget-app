import { getCurrentUser } from "@/lib/auth";
import { normalizeText } from "@/lib/text";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({ name: z.string().trim().min(1).max(180) });
const patchSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(180).optional(), archived: z.boolean().optional() });
const deleteSchema = z.object({ id: z.string().uuid() });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Adj meg egy bolt- vagy partnernevet." }, { status: 400 });
  const name = parsed.data.name;
  const normalized = normalizeText(name);
  const merchant = await prisma.merchant.upsert({
    where: { userId_normalized: { userId: user.id, normalized } },
    update: { name, archivedAt: null },
    create: { userId: user.id, name, normalized },
  });
  return Response.json({ ok: true, id: merchant.id });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Érvénytelen módosítás." }, { status: 400 });
  const merchant = await prisma.merchant.findFirst({ where: { id: parsed.data.id, userId: user.id } });
  if (!merchant) return Response.json({ error: "A partner nem található." }, { status: 404 });
  try {
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: {
        name: parsed.data.name,
        normalized: parsed.data.name ? normalizeText(parsed.data.name) : undefined,
        archivedAt: parsed.data.archived === undefined ? undefined : parsed.data.archived ? new Date() : null,
      },
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Ez a partnernév már létezik." }, { status: 409 });
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Érvénytelen törlési kérés." }, { status: 400 });
  const merchant = await prisma.merchant.findFirst({ where: { id: parsed.data.id, userId: user.id } });
  if (!merchant) return Response.json({ error: "A partner nem található." }, { status: 404 });
  const used = (await prisma.expensePurchase.count({ where: { merchantId: merchant.id } })) + (await prisma.receipt.count({ where: { merchantId: merchant.id } })) > 0;
  if (used) {
    await prisma.merchant.update({ where: { id: merchant.id }, data: { archivedAt: new Date() } });
    return Response.json({ ok: true, mode: "archived" });
  }
  await prisma.merchant.delete({ where: { id: merchant.id } });
  return Response.json({ ok: true, mode: "deleted" });
}
