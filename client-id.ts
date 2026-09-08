/**
 * Client-only ephemeral ID helper.
 *
 * Role:
 * - generates stable-enough IDs for dynamic React form rows and list keys;
 * - avoids direct `crypto.randomUUID()` calls, which are unavailable in some
 *   non-secure browser contexts such as mobile LAN development over plain HTTP;
 * - never replaces server-side IDs, database primary keys, auth tokens, or any
 *   security-sensitive identifier.
 *
 * Data flow:
 * UI form component -> createClientId() -> local React row ID only.
 */

let fallbackCounter = 0;

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function createClientId(prefix = "row"): string {
  const browserCrypto = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;

  // Preferred path in HTTPS and localhost secure contexts.
  if (browserCrypto && typeof browserCrypto.randomUUID === "function") {
    return browserCrypto.randomUUID();
  }

  // `getRandomValues` has broader browser availability than `randomUUID`.
  // Build an RFC 4122 version-4-shaped UUID for local UI identity only.
  if (browserCrypto && typeof browserCrypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    browserCrypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return bytesToUuid(bytes);
  }

  // Last-resort compatibility fallback for unusually restricted browsers.
  // This is intentionally NOT used for security-sensitive identifiers.
  fallbackCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackCounter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
