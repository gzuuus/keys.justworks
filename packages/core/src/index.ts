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
 * Drift guard: a golden-vector test (known input → expected bytes) belongs here
 * and must pass in every surface's CI. TODO until the test runner is wired.
 */

/**
 * The keystone passphrase feeds NIP-49 scrypt.
 *
 * Canonical scheme: `identifier ‖ password` (plain concatenation). Changing this
 * is a BREAKING contract change — every existing ncryptsec would need
 * re-encryption with the new scheme. Cryptographically adequate here: each
 * account has its own ncryptsec, so a concatenation collision never lets one
 * account decrypt another's blob.
 */
export function passphrase(identifier: string, password: string): string {
  return identifier + password;
}

/**
 * Client-side locator sent to the server so it never sees the plaintext
 * identifier. The server stores/looks up by this hash only.
 *
 * TODO(build decision — see docs/design.md "Open questions"): SHA-256 (fast
 * login, dictionary-attackable locator) vs a memory-hard hash (slower login,
 * resistant). SHA-256 is the current default; revisit before launch.
 */
export async function identifierHash(identifier: string): Promise<string> {
  const data = new TextEncoder().encode(identifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

/** Lowercase hex of a byte array. */
export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

// TODO: NIP-49 encrypt/decrypt via @nostr/tools `nip49` once the register/login
// flows land. Both surfaces MUST use these wrappers, never a raw copy.
