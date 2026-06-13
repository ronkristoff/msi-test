"use node";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export function encryptPat(plaintext: string, key: string): string {
  const keyBuffer = Buffer.from(key, "base64");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptPat(ciphertext: string, key: string): string {
  const [ivB64, authTagB64, dataB64] = ciphertext.split(":");
  const keyBuffer = Buffer.from(key, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(data) + decipher.final("utf8");
}
