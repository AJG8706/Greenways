import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, keyLast4 } from "@/lib/keys/crypto";

describe("service-key envelope crypto", () => {
  const KEK = "a-long-random-master-secret";

  it("round-trips a key and never stores it in the clear", () => {
    const secret = "sk-ant-api03-example-key-value";
    const stored = encryptSecret(secret, KEK);
    expect(stored.startsWith("v1:")).toBe(true);
    expect(stored).not.toContain(secret);
    expect(decryptSecret(stored, KEK)).toBe(secret);
  });

  it("produces a fresh envelope per encryption (random IV)", () => {
    expect(encryptSecret("same", KEK)).not.toBe(encryptSecret("same", KEK));
  });

  it("rejects the wrong master key and tampered ciphertext", () => {
    const stored = encryptSecret("secret", KEK);
    expect(() => decryptSecret(stored, "wrong-master")).toThrow();
    const tampered = stored.slice(0, -4) + (stored.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => decryptSecret(tampered, KEK)).toThrow();
    expect(() => decryptSecret("v0:abc", KEK)).toThrow(/format/);
  });

  it("exposes only the last 4 characters", () => {
    expect(keyLast4("sk-ant-1234")).toBe("1234");
  });
});
