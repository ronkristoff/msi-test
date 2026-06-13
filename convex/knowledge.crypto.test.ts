/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { randomBytes } from "crypto";

describe("knowledge crypto", () => {
  it("encryptPat and decryptPat round-trip", async () => {
    const { encryptPat, decryptPat } = await import("./knowledge/crypto");
    const key = randomBytes(32).toString("base64");
    const plaintext = "ghp_abcdef1234567890";

    const encrypted = encryptPat(plaintext, key);
    const decrypted = decryptPat(encrypted, key);

    expect(decrypted).toBe(plaintext);
  });

  it("encrypted output has iv:authTag:ciphertext format", async () => {
    const { encryptPat } = await import("./knowledge/crypto");
    const key = randomBytes(32).toString("base64");
    const encrypted = encryptPat("test-pat-token", key);

    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0);
    }
  });

  it("different encryptions produce different ciphertext", async () => {
    const { encryptPat } = await import("./knowledge/crypto");
    const key = randomBytes(32).toString("base64");
    const plaintext = "same-token";

    const enc1 = encryptPat(plaintext, key);
    const enc2 = encryptPat(plaintext, key);

    expect(enc1).not.toBe(enc2);
  });

  it("decryptPat throws with wrong key", async () => {
    const { encryptPat, decryptPat } = await import("./knowledge/crypto");
    const key1 = randomBytes(32).toString("base64");
    const key2 = randomBytes(32).toString("base64");
    const encrypted = encryptPat("test-token", key1);

    expect(() => decryptPat(encrypted, key2)).toThrow();
  });
});
