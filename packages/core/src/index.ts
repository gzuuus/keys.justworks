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
 * `@noble/{ciphers,curves,hashes}` transitively; we go through `nostr-tools/nip49`
 * for NIP-49 so our surface stays decoupled from its internal noble versions. We
 * DO import `@noble/hashes/scrypt` directly for `passwordSecret` — scrypt is not
 * exposed by `nostr-tools`, and it is a separate memory-hard KDF (not a shortcut
 * under an API nostr-tools already exposes). The version is pinned to match the
 * transitive copy so the bundle carries one.
 */
import {
  encrypt as nip49Encrypt,
  decrypt as nip49Decrypt,
} from "nostr-tools/nip49";
import type { Ncryptsec } from "nostr-tools/nip19";
import { scryptAsync } from "@noble/hashes/scrypt.js";

export * from "./api";

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
 * Memory-hard secret derived from the password and sent to the server for auth,
 * so the raw password never leaves the client (design.md "client-derived auth
 * secret"). The server applies its own argon2 on top before storing — the wire
 * value is never what's in the DB.
 *
 * Why scrypt and not WebCrypto: browser WebCrypto has no scrypt/argon2; its only
 * KDF (PBKDF2) is GPU-crackable and would lower the operator floor.
 * Memory-hardness is the whole point, so we use `@noble/hashes` scrypt.
 *
 * SECURITY CONTRACT — same byte-identical-across-surfaces rule as `passphrase`
 * and `identifierHash`: a user registers on one surface and authenticates on
 * another, so this MUST produce identical bytes for a given `(identifier,
 * password)`. Changing `N`/`r`/`p`, the salt scheme, or `dkLen` is a BREAKING
 * auth-contract change — existing accounts can no longer log in. The golden
 * vector in `index.test.ts` locks it.
 *
 * `N = 2**16` matches the blob's NIP-49 scrypt cost so the operator floor stays
 * equal to the static-breach floor (lowering it would drop the floor).
 *
 * `scryptAsync` yields to the event loop between phases but is still CPU-bound
 * for ~tens–hundreds of ms, so deriving it on the page briefly janks the UI
 * (notably under CPU throttling). The surfaces currently call this from the
 * page; moving it into the keyholder Worker (like `decryptSecret`) is a tracked
 * follow-up.
 */
export async function passwordSecret(
  identifier: string,
  password: string,
): Promise<string> {
  const salt = `keys.justworks-password-secret-v1:${identifier}`;
  const out = await scryptAsync(password, salt, { N: 2 ** 16, r: 8, p: 1, dkLen: 32 });
  return bytesToHex(out);
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
