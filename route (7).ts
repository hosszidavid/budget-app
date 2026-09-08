import { createSession, getCurrentUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10).max(200) });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Az új jelszó legalább 10 karakter legyen." }, { status: 400 });
  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) return Response.json({ error: "A jelenlegi jelszó nem megfelelő." }, { status: 400 });
  if (parsed.data.currentPassword === parsed.data.newPassword) return Response.json({ error: "Az új jelszó legyen eltérő a jelenlegitől." }, { status: 400 });
  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);
  await createSession(user.id);
  return Response.json({ ok: true });
}
