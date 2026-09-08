import { prisma } from "@/lib/prisma";
import { usesVercelBlob } from "@/lib/receipt-image";

export const runtime = "nodejs";

export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, database: "ok", receiptStorage: usesVercelBlob() ? "vercel-blob" : "database", ms: Date.now() - started, version: "0.14.0" }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("healthcheck database failed", error);
    return Response.json({ ok: false, database: "error", version: "0.14.0" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
