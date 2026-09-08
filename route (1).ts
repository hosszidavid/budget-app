import { getCurrentUser } from "@/lib/auth";
import { buildBackup } from "@/lib/backup";
import { usesVercelBlob } from "@/lib/receipt-image";
import { issueSignedToken, presignUrl, put } from "@vercel/blob";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nincs bejelentkezve." }, { status: 401 });
  const url = new URL(request.url);
  const includeImages = url.searchParams.get("images") === "1";
  const backup = await buildBackup(user.id, includeImages);
  const body = JSON.stringify(backup, null, 2);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `budget-backup-${date}${includeImages ? "-with-images" : ""}.json`;

  // A full backup can exceed Vercel's 4.5 MB Function response limit.
  // In production Blob mode write it privately to Blob and redirect the
  // authenticated browser to a short-lived signed download URL.
  if (includeImages && usesVercelBlob()) {
    const pathname = `backups/${user.id}/latest-full.json`;
    await put(pathname, body, { access: "private", contentType: "application/json", allowOverwrite: true, addRandomSuffix: false });
    const validUntil = Date.now() + 10 * 60 * 1000;
    const token = await issueSignedToken({ operations: ["get"] });
    const { presignedUrl } = await presignUrl(token, { pathname, operation: "get", validUntil });
    return Response.redirect(presignedUrl, 302);
  }

  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
