import { getCurrentUser } from "@/lib/auth";
import { mergeFromBackup, replaceFromBackup } from "@/lib/backup";
import { cleanupBackupSource, loadBackupSource } from "@/lib/backup-transport";
import { z } from "zod";

const envelope = z.object({ mode: z.enum(["replace", "merge"]), source: z.any() });

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const parsed = envelope.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Érvénytelen import kérés." }, { status: 400 });
  let blobUrl: string | null = null;
  try {
    const loaded = await loadBackupSource(user, parsed.data.source);
    blobUrl = loaded.blobUrl;
    const backup = loaded.backup;
    if (parsed.data.mode === "replace") {
      await replaceFromBackup(user.id, backup);
      await cleanupBackupSource(blobUrl);
      return Response.json({ ok: true, mode: "replace", message: "A backup visszaállítása elkészült." });
    }
    const result = await mergeFromBackup(user.id, user.dataSpaceId, backup);
    await cleanupBackupSource(blobUrl);
    return Response.json({ ok: true, mode: "merge", ...result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Az import nem sikerült." }, { status: 400 });
  }
}
