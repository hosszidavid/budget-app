import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, keyHex] = stored.split(":");
  if (!salt || !keyHex) return false;
  const storedKey = Buffer.from(keyHex, "hex");
  const derivedKey = (await scrypt(password, salt, storedKey.length)) as Buffer;
  return storedKey.length === derivedKey.length && timingSafeEqual(storedKey, derivedKey);
}
