/** Shared, database-backed login throttling for multi-instance deployments. */
import { createHash } from "node:crypto";
import { prisma } from "./prisma";

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("cf-connecting-ip") || forwarded || request.headers.get("x-real-ip") || "unknown";
}

function rateKey(request: Request, email: string) {
  return createHash("sha256").update(`${clientIp(request)}|${email.trim().toLowerCase()}`).digest("hex");
}

export async function assertLoginAllowed(request: Request, email: string) {
  const key = rateKey(request, email);
  const now = new Date();
  const row = await prisma.authRateLimit.findUnique({ where: { key } });
  if (!row) return { key };
  if (row.blockedUntil && row.blockedUntil > now) {
    const seconds = Math.max(1, Math.ceil((row.blockedUntil.getTime() - now.getTime()) / 1000));
    throw new Error(`Túl sok sikertelen próbálkozás. Próbáld újra ${seconds} másodperc múlva.`);
  }
  if (now.getTime() - row.windowStart.getTime() > WINDOW_MS) {
    await prisma.authRateLimit.update({ where: { key }, data: { attempts: 0, windowStart: now, blockedUntil: null } });
  }
  return { key };
}

export async function recordLoginFailure(key: string) {
  const now = new Date();
  const current = await prisma.authRateLimit.findUnique({ where: { key } });
  const expired = !current || now.getTime() - current.windowStart.getTime() > WINDOW_MS;
  const attempts = expired ? 1 : current.attempts + 1;
  await prisma.authRateLimit.upsert({
    where: { key },
    create: { key, attempts, windowStart: now, blockedUntil: attempts >= MAX_ATTEMPTS ? new Date(now.getTime() + BLOCK_MS) : null },
    update: {
      attempts,
      windowStart: expired ? now : current!.windowStart,
      blockedUntil: attempts >= MAX_ATTEMPTS ? new Date(now.getTime() + BLOCK_MS) : null,
    },
  });
}

export async function clearLoginLimit(key: string) {
  await prisma.authRateLimit.deleteMany({ where: { key } });
}
