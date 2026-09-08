import { getCurrentUser } from "@/lib/auth";
import { usesVercelBlob } from "@/lib/receipt-image";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

const MAX_BACKUP_BYTES = 200 * 1024 * 1024;

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!usesVercelBlob()) return Response.json({ error: "A privát Blob tárhely nincs engedélyezve." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return Response.json({ error: "Érvénytelen backup feltöltési kérés." }, { status: 400 });
  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const user = await getCurrentUser();
        if (!user) throw new Error("Nincs bejelentkezve.");
        const prefix = `backups/import/${user.dataSpaceId}/`;
        if (!pathname.startsWith(prefix)) throw new Error("A backup útvonala nem ehhez az adattérhez tartozik.");
        return {
          allowedContentTypes: ["application/json"],
          maximumSizeInBytes: MAX_BACKUP_BYTES,
          addRandomSuffix: false,
          allowOverwrite: true,
          validUntil: Date.now() + 10 * 60 * 1000,
        };
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(response);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "A backup feltöltés előkészítése nem sikerült." }, { status: 400 });
  }
}
