/**
 * Receipt image storage abstraction.
 *
 * Local development keeps receipt images in PostgreSQL so the app works with
 * no extra services. Production on Vercel can switch to private Vercel Blob,
 * which avoids Vercel Function request-size limits and keeps draft images out
 * of the relational database. Existing database-backed and legacy filesystem
 * images remain readable/deletable for backwards compatibility.
 */
import { del, get, head, issueSignedToken, presignUrl } from "@vercel/blob";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./prisma";

const LEGACY_ROOT = path.join(process.cwd(), ".receipt-data");
const DB_PREFIX = "db:";

function idFromKey(storageKey: string) {
  return storageKey.startsWith(DB_PREFIX) ? storageKey.slice(DB_PREFIX.length) : null;
}

function resolveLegacy(storageKey: string) {
  const resolved = path.resolve(LEGACY_ROOT, storageKey);
  if (!resolved.startsWith(path.resolve(LEGACY_ROOT) + path.sep)) throw new Error("Unsafe storage key");
  return resolved;
}

function safeName(value: string | null | undefined) {
  const clean = String(value || "receipt.jpg").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return clean.slice(0, 120) || "receipt.jpg";
}

export function usesVercelBlob() {
  return process.env.RECEIPT_IMAGE_STORAGE === "vercel-blob";
}

async function blobToBuffer(urlOrPathname: string) {
  const result = await get(urlOrPathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) throw new Error("A blokkfotó nem található a privát tárhelyen.");
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

/** Create an authenticated pending slot before a direct browser -> Blob upload. */
export async function createBlobUploadSlot(userId: string, originalName: string, mimeType: string, sizeBytes: number) {
  const row = await prisma.receiptImage.create({
    data: { userId, data: null, mimeType, originalName: originalName || null, sizeBytes },
    select: { id: true },
  });
  return {
    token: row.id,
    pathname: `receipts/${userId}/incoming/${row.id}/${safeName(originalName)}`,
  };
}

/** Verify the private Blob object server-side before binding it to the pending row. */
export async function confirmBlobUpload(userId: string, token: string, blobUrl: string) {
  const row = await prisma.receiptImage.findFirst({ where: { id: token, userId, receiptId: null }, select: { id: true } });
  if (!row) throw new Error("A blokkfeltöltés már nem található.");
  const details = await head(blobUrl);
  const expectedPrefix = `receipts/${userId}/incoming/${token}/`;
  if (!details.pathname.startsWith(expectedPrefix)) throw new Error("A feltöltött blokk nem ehhez a felhasználóhoz tartozik.");
  await prisma.receiptImage.update({
    where: { id: token },
    data: {
      blobUrl: details.url,
      blobPathname: details.pathname,
      mimeType: details.contentType || "application/octet-stream",
      sizeBytes: details.size,
    },
  });
  return { mimeType: details.contentType || "application/octet-stream", sizeBytes: details.size };
}

/** Read a still-unattached upload for AI recognition/retry. */
export async function readIncomingReceiptImage(userId: string, token: string) {
  const row = await prisma.receiptImage.findFirst({
    where: { id: token, userId, receiptId: null },
    select: { data: true, blobUrl: true, mimeType: true, originalName: true },
  });
  if (!row) throw new Error("A feltöltött blokkfotó már nem található.");
  const bytes = row.data ? Buffer.from(row.data) : row.blobUrl ? await blobToBuffer(row.blobUrl) : null;
  if (!bytes) throw new Error("A blokkfotó feltöltése még nem fejeződött be.");
  return { bytes, mimeType: row.mimeType, originalName: row.originalName || "receipt" };
}

/** Local/database fallback used when Vercel Blob is not enabled. */
export async function saveIncomingReceiptImage(userId: string, bytes: Buffer, mimeType: string, originalName?: string | null) {
  const row = await prisma.receiptImage.create({
    data: { userId, data: bytes, mimeType, originalName: originalName || null, sizeBytes: bytes.byteLength },
    select: { id: true },
  });
  return { token: row.id, storageKey: `${DB_PREFIX}${row.id}` };
}

export async function attachReceiptImage(userId: string, receiptId: string, token: string) {
  const row = await prisma.receiptImage.findFirst({ where: { id: token, userId, receiptId: null }, select: { id: true } });
  if (!row) throw new Error("A feltöltött blokkfotó már nem található.");
  const oldRows = await prisma.receiptImage.findMany({ where: { userId, receiptId, id: { not: row.id } }, select: { id: true, blobUrl: true } });
  for (const old of oldRows) if (old.blobUrl) await del(old.blobUrl).catch(() => {});
  await prisma.$transaction([
    prisma.receiptImage.deleteMany({ where: { userId, receiptId, id: { not: row.id } } }),
    prisma.receiptImage.update({ where: { id: row.id }, data: { receiptId } }),
  ]);
  return `${DB_PREFIX}${row.id}`;
}

export async function getReceiptImageSignedUrl(storageKey: string, userId: string) {
  const id = idFromKey(storageKey);
  if (!id) return null;
  const row = await prisma.receiptImage.findFirst({ where: { id, userId }, select: { blobPathname: true } });
  if (!row?.blobPathname) return null;
  const validUntil = Date.now() + 5 * 60 * 1000;
  const token = await issueSignedToken({ operations: ["get"] });
  const { presignedUrl } = await presignUrl(token, { pathname: row.blobPathname, operation: "get", validUntil });
  return presignedUrl;
}

export async function readReceiptImage(storageKey: string, userId?: string) {
  const id = idFromKey(storageKey);
  if (id) {
    const row = userId
      ? await prisma.receiptImage.findFirst({ where: { id, userId }, select: { data: true, blobUrl: true } })
      : await prisma.receiptImage.findUnique({ where: { id }, select: { data: true, blobUrl: true } });
    if (!row) throw new Error("A blokkfotó nem található.");
    if (row.data) return Buffer.from(row.data);
    if (row.blobUrl) return blobToBuffer(row.blobUrl);
    throw new Error("A blokkfotó nem található.");
  }
  if (userId && !storageKey.startsWith(`${userId}/`)) throw new Error("Unsafe storage key");
  return readFile(resolveLegacy(storageKey));
}

export async function deleteReceiptImage(storageKey: string | null | undefined, userId?: string) {
  if (!storageKey) return;
  const id = idFromKey(storageKey);
  if (id) {
    const row = userId
      ? await prisma.receiptImage.findFirst({ where: { id, userId }, select: { id: true, blobUrl: true } })
      : await prisma.receiptImage.findUnique({ where: { id }, select: { id: true, blobUrl: true } });
    if (!row) return;
    if (row.blobUrl) await del(row.blobUrl).catch(() => {});
    await prisma.receiptImage.deleteMany({ where: userId ? { id, userId } : { id } });
    return;
  }
  if (userId && !storageKey.startsWith(`${userId}/`)) return;
  try { await rm(resolveLegacy(storageKey), { force: true }); } catch {}
}

export async function deleteIncomingReceiptImage(userId: string, token: string) {
  const row = await prisma.receiptImage.findFirst({ where: { id: token, userId, receiptId: null }, select: { blobUrl: true } });
  if (row?.blobUrl) await del(row.blobUrl).catch(() => {});
  await prisma.receiptImage.deleteMany({ where: { id: token, userId, receiptId: null } });
}

export async function cleanupIncomingReceiptImages(userId: string, maxAgeMs = 24 * 60 * 60 * 1000) {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const stale = await prisma.receiptImage.findMany({ where: { userId, receiptId: null, createdAt: { lt: cutoff } }, select: { id: true, blobUrl: true } });
  for (const row of stale) if (row.blobUrl) await del(row.blobUrl).catch(() => {});
  if (stale.length) await prisma.receiptImage.deleteMany({ where: { id: { in: stale.map(row => row.id) }, userId } });
}
