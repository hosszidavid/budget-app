import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const MODELS = ["gemini-3.5-flash", "gemini-3.6-flash"] as const;
const schema = z.object({ geminiModel: z.enum(MODELS) });

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Nem támogatott Gemini modell." }, { status: 400 });
  const updated = await prisma.user.update({ where: { id: user.id }, data: { geminiModel: parsed.data.geminiModel }, select: { geminiModel: true } });
  return Response.json({ ok: true, ...updated });
}
