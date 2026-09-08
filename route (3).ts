import { getCurrentUser } from "@/lib/auth";
import { backupSummary } from "@/lib/backup";
import { loadBackupSource } from "@/lib/backup-transport";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  try {
    const source = await request.json();
    const { backup } = await loadBackupSource(user, source);
    return Response.json({ ok: true, sameDataSpace: backup.dataSpaceId === user.dataSpaceId, ...backupSummary(backup) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "A backup nem olvasható." }, { status: 400 });
  }
}
