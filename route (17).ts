import { getCurrentUser } from "@/lib/auth";
import { cleanupIncomingReceiptImages, createBlobUploadSlot, usesVercelBlob } from "@/lib/receipt-image";
import { z } from "zod";

const ALLOWED = new Set(["image/jpeg","image/jpg","image/png","image/webp","image/heic","image/heif"]);
const MAX_BYTES = 12 * 1024 * 1024;
const schema = z.object({ name: z.string().min(1).max(255), type: z.string().min(1).max(100), size: z.number().int().positive().max(MAX_BYTES) });

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !ALLOWED.has(parsed.data.type)) return Response.json({ error: "JPEG, PNG, WebP vagy HEIC blokkfotó használható, legfeljebb 12 MB méretben." }, { status: 400 });
  await cleanupIncomingReceiptImages(user.id).catch(() => {});
  if (!usesVercelBlob()) return Response.json({ ok: true, mode: "inline" });
  const slot = await createBlobUploadSlot(user.id, parsed.data.name, parsed.data.type, parsed.data.size);
  return Response.json({ ok: true, mode: "blob", imageToken: slot.token, pathname: slot.pathname });
}
