import { createSession } from "@/lib/auth";
import { createDefaultData } from "@/lib/defaults";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({ email: z.string().email(), password: z.string().min(10).max(200), registrationToken: z.string().max(300).optional() });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Érvénytelen email vagy túl rövid jelszó." }, { status: 400 });
  const allowOpen = process.env.ALLOW_REGISTRATION === "true" || (process.env.NODE_ENV !== "production" && process.env.ALLOW_REGISTRATION !== "false");
  const requiredToken = process.env.REGISTRATION_TOKEN?.trim();
  if (!allowOpen && !requiredToken) return Response.json({ error: "A nyilvános regisztráció ezen a telepítésen ki van kapcsolva." }, { status: 403 });
  if (requiredToken && parsed.data.registrationToken !== requiredToken) return Response.json({ error: "Érvénytelen regisztrációs kód." }, { status: 403 });
  const email = parsed.data.email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) return Response.json({ error: "Ez az email már használatban van." }, { status: 409 });

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({ data: { email, passwordHash } });
    await createDefaultData(tx, created.id);
    return created;
  }, { timeout: 20000 });

  await createSession(user.id);
  return Response.json({ ok: true });
}
