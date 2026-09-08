import { getCurrentUser } from "@/lib/auth";
import { confirmBlobUpload, usesVercelBlob } from "@/lib/receipt-image";
import { z } from "zod";

const schema = z.object({ imageToken: z.string().uuid(), blobUrl: z.string().url() });

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!usesVercelBlob()) return Response.json({ error: "A privát Blob tárhely nincs engedélyezve." }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Érvénytelen feltöltési megerősítés." }, { status: 400 });
  try {
    const result = await confirmBlobUpload(user.id, parsed.data.imageToken, parsed.data.blobUrl);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "A feltöltés megerősítése nem sikerült." }, { status: 400 });
  }
}
