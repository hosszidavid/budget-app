import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({ name: z.string().trim().min(1).max(120) });
const patchSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120).optional(), archived: z.boolean().optional() });
const deleteSchema = z.object({ id: z.string().uuid() });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Adj meg egy nevet." }, { status: 400 });
  try {
    const person = await prisma.person.create({ data: { userId: user.id, name: parsed.data.name } });
    return Response.json({ ok: true, id: person.id });
  } catch {
    return Response.json({ error: "Ez a személy már létezik." }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Érvénytelen módosítás." }, { status: 400 });
  const person = await prisma.person.findFirst({ where: { id: parsed.data.id, userId: user.id } });
  if (!person) return Response.json({ error: "A személy nem található." }, { status: 404 });
  try {
    await prisma.person.update({
      where: { id: person.id },
      data: {
        name: parsed.data.name,
        archivedAt: parsed.data.archived === undefined ? undefined : parsed.data.archived ? new Date() : null,
      },
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Ez a név már használatban van." }, { status: 409 });
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Érvénytelen törlési kérés." }, { status: 400 });
  const person = await prisma.person.findFirst({ where: { id: parsed.data.id, userId: user.id } });
  if (!person) return Response.json({ error: "A személy nem található." }, { status: 404 });
  const used = (await prisma.expensePurchase.count({ where: { personId: person.id } })) + (await prisma.incomeEntry.count({ where: { personId: person.id } })) > 0;
  if (used) {
    await prisma.person.update({ where: { id: person.id }, data: { archivedAt: new Date() } });
    return Response.json({ ok: true, mode: "archived" });
  }
  await prisma.person.delete({ where: { id: person.id } });
  return Response.json({ ok: true, mode: "deleted" });
}
