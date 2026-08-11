/**
 * keys.justworks — shared crypto glue (consumed by `web` and `extension`).
 *
 * SECURITY CONTRACT — read before editing:
 * Every function here must be byte-identical across all surfaces. A user
 * registers on one surface (e.g. the website) and logs in on another (e.g. the
 * extension); any drift in passphrase derivation or identifier hashing silently
 * breaks cross-surface decryption. Do NOT reimplement these in a surface —
 * import them from here. See docs/design.md ("Core design").
 *
 * Drift guard: `index.test.ts` pins golden vectors (known input → expected
 * bytes) that fail if this contract changes. It must pass in every surface's CI.
 *
 * NIP-49 is taken from `nostr-tools` — never hand-rolled (design constraint:
 * "NIP-49 is the blob format. No custom crypto."). `nostr-tools` brings
 * `@noble/{ciphers,curves,hashes}` transitively, which we do NOT import
 * directly: we go through `nostr-tools/nip49` so our surface stays decoupled
 * from its internal noble versions.
 */
import {
  encrypt as nip49Encrypt,
  decrypt as nip49Decrypt,
} from "nostr-tools/nip49";
import type { Ncryptsec } from "nostr-tools/nip19";

/**
 * The keystone passphrase feeds NIP-49 scrypt.
 *
 * Scheme: `dec(byteLen(identifier)) ‖ ":" ‖ identifier ‖ password`.
 *
 * The byte-length prefix makes the split unambiguous (design.md "Core design",
 * condition 2): it rules out an `(id="a", pw="bc")` vs `(id="ab", pw="c")`
 * collision, which would be a silent, miserable bug. Injectivity: equal
 * passphrase strings ⇒ equal length-prefix ⇒ equal-length identifier ⇒ equal
 * identifier ⇒ equal password. Changing this scheme is a BREAKING contract
 * change — every existing ncryptsec would need re-encryption.
 *
 * Internal on purpose: surfaces pass `(identifier, password)` to
 * `encryptSecret`/`decryptSecret` and never handle the passphrase string, so
 * the concat scheme can't drift or leak through a surface. `nostr-tools` NFKC-
 * normalizes whatever we pass before scrypt; that happens identically in every
 * surface because they all call this one function.
 */
function passphrase(identifier: string, password: string): string {
  const idByteLen = new TextEncoder().encode(identifier).length;
  return `${idByteLen}:${identifier}${password}`;
}

/**
 * Client-side locator sent to the server so it never sees the plaintext
 * identifier. The server stores/looks up by this hex hash only.
 *
 * ponytail: plain SHA-256 via the native WebCrypto. The identifier is
 * defense-in-depth, not the floor (the floor is password + scrypt + NIP-49), so
 * a dictionary-attackable locator only thins the bonus layer — it never drops
 * the floor. Upgrade path if we want offline-cracking resistance on the locator
 * itself: swap this one body for argon2id/scrypt. Login cost rises (and, since
 * auth is stateless, so does every mutating request), so it's a deliberate
 * trade-off, not a free win.
 */
export async function identifierHash(identifier: string): Promise<string> {
  const data = new TextEncoder().encode(identifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Wrap a 32-byte secp256k1 secret key into a NIP-49 `ncryptsec` under the
 * keystone passphrase. `log_n = 16` is pinned (the design default and the
 * `nostr-tools` default) so a future library default change can't silently
 * alter our KDF cost for new blobs.
 *
 * Sync because `nostr-tools`/noble scrypt is sync and CPU-bound (~tens to
 * ~hundreds of ms at log_n = 16). On the website, call this from the Web Worker
 * keyholder, never the main thread.
 */
export function encryptSecret(
  secret: Uint8Array,
  identifier: string,
  password: string,
): Ncryptsec {
  if (secret.length !== 32) {
    throw new Error(`secret key must be 32 bytes, got ${secret.length}`);
  }
  return nip49Encrypt(secret, passphrase(identifier, password), 16);
}

/** Decrypt a NIP-49 `ncryptsec` back to the raw 32-byte secret key. */
export function decryptSecret(
  ncryptsec: string,
  identifier: string,
  password: string,
): Uint8Array {
  return nip49Decrypt(ncryptsec, passphrase(identifier, password));
}

/** Lowercase hex of a byte array. */
export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}
