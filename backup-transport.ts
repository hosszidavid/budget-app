/**
 * Online-safe backup transport.
 *
 * Vercel Functions cap request/response bodies at 4.5 MB. Large portable
 * backups therefore travel through the user's private Vercel Blob store while
 * small backups continue to use ordinary JSON requests in local development.
 */
import { del, get, head } from "@vercel/blob";
import { parseBackup, type BudgetBackup } from "./backup";
import { usesVercelBlob } from "./receipt-image";

export type BackupSource = BudgetBackup | { blobUrl: string };

export async function loadBackupSource(user: { id: string; dataSpaceId: string }, value: unknown): Promise<{ backup: BudgetBackup; blobUrl: string | null }> {
  if (value && typeof value === "object" && typeof (value as any).blobUrl === "string") {
    if (!usesVercelBlob()) throw new Error("A nagy backup importjához nincs privát Blob tárhely beállítva.");
    const blobUrl = String((value as any).blobUrl);
    const details = await head(blobUrl);
    const prefix = `backups/import/${user.dataSpaceId}/`;
    if (!details.pathname.startsWith(prefix)) throw new Error("A backup feltöltés nem ehhez az adattérhez tartozik.");
    const result = await get(blobUrl, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) throw new Error("A feltöltött backup nem olvasható.");
    const text = await new Response(result.stream).text();
    return { backup: parseBackup(JSON.parse(text)), blobUrl };
  }
  return { backup: parseBackup(value), blobUrl: null };
}

export async function cleanupBackupSource(blobUrl: string | null) {
  if (blobUrl) await del(blobUrl).catch(() => {});
}
