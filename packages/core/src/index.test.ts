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
import { getPublicKey, nip19 } from "nostr-tools";
import { identifierHash, passwordSecret, encryptSecret, decryptSecret } from "./index";

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

describe("passwordSecret", () => {
  // Locks the scrypt params (N/r/p), the salt scheme
  // (`keys.justworks-password-secret-v1:` + identifier), and dkLen. A change
  // here is a BREAKING auth-contract change — existing accounts can no longer
  // log in. Same drift rationale as the identifierHash golden above.
  it("matches the golden vector (locks scrypt params + salt scheme)", async () => {
    expect(await passwordSecret(ID, PW)).toBe(
      "bf4bf9a5ecfec3f96390af8783cf5b68caea179bf505719236c35660e85ee98c",
    );
  });

  it("is 32 bytes (64 hex) and deterministic for the same input", async () => {
    const a = await passwordSecret(ID, PW);
    const b = await passwordSecret(ID, PW);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("changes with the identifier (per-user salt) and the password", async () => {
    expect(await passwordSecret("bob@example.com", PW)).not.toBe(await passwordSecret(ID, PW));
    expect(await passwordSecret(ID, "different pw")).not.toBe(await passwordSecret(ID, PW));
  });
});

describe("identifier normalization (trim at the crypto boundary)", () => {
  // One account must not silently become two because of a stray trailing
  // space: register with "id " then log in with "id" would otherwise hit a
  // different hash, salt, and keystone. The trim lives in @kj/core (the single
  // choke point), so both surfaces get it for free.
  it("identifierHash ignores surrounding whitespace", async () => {
    expect(await identifierHash(`  ${ID} \n`)).toBe(await identifierHash(ID));
  });

  it("passwordSecret ignores surrounding whitespace in the identifier", async () => {
    expect(await passwordSecret(`\t${ID} `, PW)).toBe(await passwordSecret(ID, PW));
  });

  it("a blob encrypted with surrounding whitespace decrypts with the trimmed identifier", () => {
    const blob = encryptSecret(SECRET, ` ${ID}\t`, PW);
    expect(decryptSecret(blob, ID, PW)).toEqual(SECRET);
  });

  it("never trims the password (whitespace is legitimate keystone material)", async () => {
    expect(await passwordSecret(ID, ` ${PW} `)).not.toBe(await passwordSecret(ID, PW));
  });
});

describe("decrypt → npub (real recorded vector)", () => {
  // A throwaway test key created through the real browser stack (nostr-tools
  // keygen in the page → encryptSecret → server → back). Asserts the full
  // decrypt → npub path, which the synthetic golden above only covers up to
  // the secret bytes. If the passphrase scheme or the NIP-49 wiring drifts,
  // this npub no longer matches.
  const NCRYPTSEC =
    "ncryptsec1qggxyu3gpqkxlwjylnz4m29vg7arrdqltjzgyxu6wd672zpq70n5lzl8vreclge95mpsywad6xt5fer97jjw4samcswf8x2hshyvp02agdvacrlz86a8tckwuph92p4ahkxdufm4mayhs50hfusxdesn";
  const EXPECTED_NPUB =
    "npub19e9l920pdsqlz78yz3fl6auwl0pfzrz33w9szpyxw550c2rpxzlsgkrjtz";

  it("decrypts yo/123 to the expected npub", () => {
    const secret = decryptSecret(NCRYPTSEC, "yo", "123");
    expect(nip19.npubEncode(getPublicKey(secret))).toBe(EXPECTED_NPUB);
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
