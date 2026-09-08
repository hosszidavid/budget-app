import { createSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { assertLoginAllowed, clearLoginLimit, recordLoginFailure } from "@/lib/auth-rate-limit";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Hibás belépési adatok." }, { status: 400 });
  const email = parsed.data.email.trim().toLowerCase();
  let limiter: { key: string };
  try { limiter = await assertLoginAllowed(request, email); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Túl sok próbálkozás." }, { status: 429 }); }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    await recordLoginFailure(limiter.key);
    return Response.json({ error: "Hibás email vagy jelszó." }, { status: 401 });
  }
  await clearLoginLimit(limiter.key);
  await createSession(user.id);
  return Response.json({ ok: true });
}
