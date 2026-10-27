import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Envelope for vendor API keys at rest (service_keys table). Pure functions
 * so the format is unit-testable without a database or the server-only
 * import chain. Layout: "v1:" + base64(iv[12] | gcmTag[16] | ciphertext).
 */
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function deriveKey(kekSecret: string): Buffer {
  return createHash("sha256").update(kekSecret).digest();
}

export function encryptSecret(plain: string, kekSecret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(kekSecret), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64")}`;
}

export function decryptSecret(stored: string, kekSecret: string): string {
  const sep = stored.indexOf(":");
  if (sep === -1 || stored.slice(0, sep) !== VERSION) {
    throw new Error("Unknown ciphertext format");
  }
  const buf = Buffer.from(stored.slice(sep + 1), "base64");
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ct = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(kekSecret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** The only fragment of a key that is ever stored or shown in clear. */
export function keyLast4(value: string): string {
  return value.slice(-4);
}
