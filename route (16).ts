import { getCurrentUser } from "@/lib/auth";
import { usesVercelBlob } from "@/lib/receipt-image";
import { prisma } from "@/lib/prisma";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

const ALLOWED = ["image/jpeg","image/jpg","image/png","image/webp","image/heic","image/heif"];
const MAX_BYTES = 12 * 1024 * 1024;

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!usesVercelBlob()) return Response.json({ error: "A privát Blob tárhely nincs engedélyezve." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return Response.json({ error: "Érvénytelen feltöltési kérés." }, { status: 400 });
  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // This callback is initiated by the authenticated browser, so verify
        // the app session here. The later Vercel upload-completed callback has
        // no browser cookie and must not depend on getCurrentUser().
        const user = await getCurrentUser();
        if (!user) throw new Error("Nincs bejelentkezve.");
        const imageToken = String(clientPayload || "");
        const row = await prisma.receiptImage.findFirst({ where: { id: imageToken, userId: user.id, receiptId: null, blobUrl: null }, select: { id: true } });
        const expectedPrefix = `receipts/${user.id}/incoming/${imageToken}/`;
        if (!row || !pathname.startsWith(expectedPrefix)) throw new Error("A feltöltési jogosultság nem érvényes.");
        return {
          allowedContentTypes: ALLOWED,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60 * 1000,
          tokenPayload: JSON.stringify({ imageToken, userId: user.id }),
        };
      },
      onUploadCompleted: async () => {
        // /confirm performs the synchronous owner-bound metadata verification.
      },
    });
    return Response.json(response);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "A feltöltési token létrehozása nem sikerült." }, { status: 400 });
  }
}
