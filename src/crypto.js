// AES-256-GCM symmetric encryption for SMTP passwords.
// Ciphertext format: enc:v1:<iv_b64>:<tag_b64>:<ct_b64>
// MUST use the same APP_ENCRYPTION_KEY value as the Lovable app so that
// passwords encrypted in the app can be decrypted inside this microservice.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

function getKey() {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw || raw.trim().length < 8) {
    throw new Error("APP_ENCRYPTION_KEY missing");
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

export function isCipherString(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptSecret(plaintext) {
  if (plaintext == null || plaintext === "") throw new Error("encryptSecret: empty input");
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(payload) {
  if (!payload) return null;
  if (!isCipherString(payload)) return null;
  try {
    const [ivB64, tagB64, ctB64] = payload.slice(PREFIX.length).split(":");
    const key = getKey();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
    return pt.toString("utf8");
  } catch (e) {
    return null;
  }
}