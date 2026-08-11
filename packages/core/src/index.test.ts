/**
 * Golden-vector drift guard for `@kj/core`.
 *
 * These tests lock the cross-surface contract: a user registers on one surface
 * (web) and logs in on another (extension), and any drift in passphrase
 * derivation or identifier hashing silently breaks decryption. The recorded
 * vectors below must stay byte-exact; changing them is a BREAKING contract
 * change that re-encrypts every existing ncryptsec.
 */
import { describe, it, expect } from "vitest";
import { identifierHash, encryptSecret, decryptSecret } from "./index";

const ID = "alice@example.com";
const PW = "correct horse battery staple";
const SECRET = Uint8Array.from({ length: 32 }, (_, i) => i);

// Recorded from a one-shot run of `encryptSecret(SECRET, ID, PW)`. Decrypting it
// exercises the real `passphrase` scheme end-to-end: change how `identifier ‖
// password` is built and this fails — that's the point.
const GOLDEN_NCRYPTSEC =
  "ncryptsec1qggwxhx8knnvpmxz0rgh4aex8ha3yqwfgvh2gwchku66qnaawel89mvvvl9gtc7qeljq99gzzuvcl6kgf4temkx5w9nugv9v90g7jtnk6kz82zrp4qr553hnw38geqk0r7zl82pn3tquw7mj7c6ckav9";

describe("identifierHash", () => {
  it("matches the golden vector (locks SHA-256 + UTF-8 over the identifier)", async () => {
    expect(await identifierHash(ID)).toBe(
      "ff8d9819fc0e12bf0d24892e45987e249a28dce836a85cad60e28eaaa8c6d976",
    );
  });
});

describe("NIP-49 wrappers", () => {
  it("decrypts the recorded golden ncryptsec (locks the passphrase scheme)", () => {
    expect([...decryptSecret(GOLDEN_NCRYPTSEC, ID, PW)]).toEqual([...SECRET]);
  });

  it("round-trips a fresh encryption", () => {
    const enc = encryptSecret(SECRET, ID, PW);
    expect(enc).toMatch(/^ncryptsec1/);
    expect([...decryptSecret(enc, ID, PW)]).toEqual([...SECRET]);
  });

  it("rejects a wrong password (AEAD auth tag)", () => {
    expect(() => decryptSecret(GOLDEN_NCRYPTSEC, ID, "wrong")).toThrow();
  });

  it("rejects a non-32-byte secret at encrypt time", () => {
    expect(() =>
      encryptSecret(new Uint8Array(31), ID, PW),
    ).toThrow();
  });
});
