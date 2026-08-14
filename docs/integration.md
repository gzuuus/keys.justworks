# keys.justworks — API & integration

keys.justworks is a **non-custodial Nostr key locker**. A user stores an
encrypted private key (`ncryptsec`, [NIP-49]) on the server and retrieves +
decrypts it on any device. **The server never sees a plaintext key, a plaintext
identifier, or a plaintext password, and it never signs.** It stores exactly
`{ identifier_hash, password_verifier, ncryptsec }` per account — nothing more
(no npub, no email, no metadata beyond bookkeeping).

This is everything a third-party app needs to use keys.justworks as its key
backend.

## Base URL

```
https://keys.justworks.cash/api
```

`https://login.justworks.cash/api` is the same service — use either.

- **CORS:** open (`*`). Any origin may call the API cross-origin.
- **Credentials:** none. Auth travels in the request **body**, not cookies, so
  there is no CSRF surface and `Allow-Credentials` is off.
- **Transport:** HTTPS only (the server sets HSTS). Never call over plain HTTP.

## Auth model

**Stateless.** No sessions, tokens, or cookies. **Every** mutating request
re-verifies `{ identifier_hash, password_secret }` inline against the stored
verifier, and `POST /login` returns the `ncryptsec` directly. The only thing an
attacker could capture and replay is `password_secret`, and that is bounded by
per-account rate limiting.

Two values travel in every request body — both **64 lowercase hex characters**:

| Field | What it is | Derived how |
|---|---|---|
| `identifier_hash` | account locator; the server's only view of the identifier | `SHA-256(identifier)` |
| `password_secret` | the auth secret; **never the raw password** | `scrypt(password, salt = …identifier)` |

The server applies its own **argon2** on top of `password_secret` before storing
it, so the wire value is never what sits in the database, and the server never
trusts a client-supplied verifier (a client cannot register a hash for a
different password).

## The client-side crypto contract (read carefully)

This is the real integration surface. A user may register on one app and log in
on another, so **these three derivations must be byte-identical across every
client** — get one wrong and decryption silently fails.

> **`@kj/core` is not public yet.** The reference implementation lives in this
> repo ([`packages/core`](../packages/core/src/index.ts)), but it is **not
> published to npm**, so you cannot `npm install` it. Until it is, **reimplement
> the three functions below** following the reference exactly, and verify your
> client against the [golden vectors](#golden-vectors-verify-your-client). The
> snippets here *are* the contract.

Shared helpers:

```ts
const utf8 = (s: string) => new TextEncoder().encode(s);
const toHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
```

### 1. `identifier_hash` — SHA-256 of the identifier

```ts
async function identifierHash(identifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", utf8(identifier));
  return toHex(new Uint8Array(digest));
}
```

Plain SHA-256 over the UTF-8 bytes of the identifier, lowercase hex. (The
identifier is defense-in-depth, not the security floor.)

### 2. `password_secret` — scrypt of the password

```ts
import { scryptAsync } from "@noble/hashes/scrypt.js";

async function passwordSecret(identifier: string, password: string): Promise<string> {
  const salt = `keys.justworks-password-secret-v1:${identifier}`;
  return toHex(await scryptAsync(password, salt, { N: 2 ** 16, r: 8, p: 1, dkLen: 32 }));
}
```

**Exact params:** `N = 65536 (2¹⁶)`, `r = 8`, `p = 1`, `dkLen = 32` (32 bytes →
64 hex). **Salt:** the literal ASCII string `keys.justworks-password-secret-v1:`
immediately followed by the identifier (per-user salt). The raw password never
leaves the client. (Browser WebCrypto has no scrypt — that's why `@noble/hashes`
is used; PBKDF2 would lower the floor.)

### 3. `ncryptsec` — NIP-49 with the keystone passphrase

```ts
import { encrypt as nip49Encrypt, decrypt as nip49Decrypt } from "nostr-tools/nip49";

function passphrase(identifier: string, password: string): string {
  const idByteLen = utf8(identifier).length; // UTF-8 byte length
  return `${idByteLen}:${identifier}${password}`;
}

// `secret` is 32 raw secp256k1 bytes; log_n = 16 pins the NIP-49 scrypt cost.
const encryptSecret = (secret: Uint8Array, id: string, pw: string) =>
  nip49Encrypt(secret, passphrase(id, pw), 16);
const decryptSecret = (ncryptsec: string, id: string, pw: string) =>
  nip49Decrypt(ncryptsec, passphrase(id, pw));
```

The passphrase is **`dec(byteLen(identifier)) ‖ ":" ‖ identifier ‖ password`** —
the byte-length prefix makes the split unambiguous (it rules out
`(id="a", pw="bc")` colliding with `(id="ab", pw="c")`). `nostr-tools/nip49`
NFKC-normalizes the passphrase before its internal scrypt, so **use
`nostr-tools` (or rust-nostr `nip49`) for NIP-49** to match that normalization —
do not hand-roll the AEAD. Pass `16` for `log_n` explicitly so a future library
default change can't alter your KDF cost.

### Golden vectors (verify your client)

Your derivation must reproduce these exactly:

```
identifierHash("alice@example.com")
  → ff8d9819fc0e12bf0d24892e45987e249a28dce836a85cad60e28eaaa8c6d976

passwordSecret("alice@example.com", "correct horse battery staple")
  → bf4bf9a5ecfec3f96390af8783cf5b68caea179bf505719236c35660e85ee98c

decryptSecret(ncryptsec, "yo", "123")
  → npub19e9l920pdsqlz78yz3fl6auwl0pfzrz33w9szpyxw550c2rpxzlsgkrjtz
  (ncryptsec = ncryptsec1qggxyu3gpqkxlwjylnz4m29vg7arrdqltjzgyxu6wd672zpq70n5lzl8vreclge95mpsywad6xt5fer97jjw4samcswf8x2hshyvp02agdvacrlz86a8tckwuph92p4ahkxdufm4mayhs50hfusxdesn)
```

A drop-in conformance test is at the end of this document.

## Endpoints

All bodies are JSON; fields are `snake_case`. `identifier_hash` and
`password_secret` are always 64 hex; `ncryptsec` always starts with `ncryptsec1`.

### `GET /api/health`

Liveness probe → `200 "ok"`.

```
curl https://keys.justworks.cash/api/health
```

### `POST /api/register`

Create an account. The client generates a secp256k1 key, encrypts it under the
keystone passphrase, and sends the three derived values.

```jsonc
// request → 201 Created
{
  "identifier_hash": "ff8d…d976",   // SHA-256(identifier)
  "password_secret": "bf4b…e98c",   // scrypt(password)
  "ncryptsec":       "ncryptsec1…"
}
```

| Status | Meaning |
|---|---|
| `201` | created |
| `409` | an account with that `identifier_hash` already exists |
| `400` | bad shape (`identifier_hash`/`password_secret` not 64 hex, or `ncryptsec` not `ncryptsec1…`) |
| `429` | rate limited — honors `Retry-After` |

### `POST /api/login`

Verify credentials and return the stored `ncryptsec`. The client decrypts it
locally with the keystone passphrase.

```jsonc
// request
{ "identifier_hash": "ff8d…d976", "password_secret": "bf4b…e98c" }
// → 200 OK
{ "ncryptsec": "ncryptsec1…" }
```

`401` covers **both** a missing account and a wrong secret — the response does
not reveal whether an account exists.

### `PUT /api/blob`

Re-authenticate, then replace the stored blob. Omit `new_password_secret` to
re-encrypt under the **same** password (e.g. key rotation); include it to change
the **password** — the client must re-encrypt `new_ncryptsec` under the **new**
passphrase (`identifier ‖ new_password`) and send `scrypt(new_password)` as
`new_password_secret`. Both stored fields update atomically.

```jsonc
{
  "identifier_hash":     "ff8d…d976",
  "password_secret":     "bf4b…e98c",   // CURRENT password, for auth
  "new_ncryptsec":       "ncryptsec1…",
  "new_password_secret": "…scrypt(new_password)…"   // optional; only on password change
}
// → 204 No Content
```

### `DELETE /api/account`

Re-authenticate, then permanently delete the account. **Irreversible** — the
encrypted blob is gone from this server (a user who kept an `nsec` backup still
owns the key elsewhere).

```jsonc
{ "identifier_hash": "ff8d…d976", "password_secret": "bf4b…e98c" }
// → 204 No Content
```

## Errors & rate limiting

| Status | When |
|---|---|
| `400` | malformed body / bad field shapes |
| `401` | wrong `identifier_hash` / `password_secret` (or no such account) |
| `409` | `register` — identifier already taken |
| `429` | rate limited — read `Retry-After` (seconds) and back off |

Rate limiting is **per-`identifier_hash`** (bounds targeted brute force on one
account) plus two **global** buckets (total auth throughput, registrations).
There is **no per-IP** limiting in the app — that is the operator's job at the
reverse proxy, and per-IP-in-the-app would punish users behind NAT/VPNs.

Sustained ceilings on a single VPS: auth ~5/s (burst 20), register ~1/s (burst
10), per-account ~6/min (burst 5). A **successful** auth refunds the per-account
token, so a legitimate user never throttles their own account.

## Worked example (browser)

Using the functions above plus `nostr-tools`:

```ts
import { generateSecretKey, getPublicKey, finalizeEvent } from "nostr-tools";

const API = "https://keys.justworks.cash/api";
const identifier = "alice@example.com";
const password = "correct horse battery staple";

// --- register ---------------------------------------------------------------
const secret = generateSecretKey();                 // CSPRNG 32 bytes
const npub = getPublicKey(secret);                  // safe to show the user
await fetch(`${API}/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    identifier_hash: await identifierHash(identifier),
    password_secret: await passwordSecret(identifier, password),
    ncryptsec: encryptSecret(secret, identifier, password),
  }),
});

// --- login (this device or another) -----------------------------------------
const res = await fetch(`${API}/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    identifier_hash: await identifierHash(identifier),
    password_secret: await passwordSecret(identifier, password),
  }),
});
const { ncryptsec } = await res.json();
const recovered = decryptSecret(ncryptsec, identifier, password); // === `secret`
console.log(getPublicKey(recovered) === npub); // true

// --- sign -------------------------------------------------------------------
const event = finalizeEvent(
  { kind: 1, content: "hello", tags: [], created_at: Math.floor(Date.now() / 1000) },
  recovered,
);
```

## Conformance snippet

Drop this into your test suite to prove your client matches the contract:

```ts
import { expect, test } from "vitest";
import { getPublicKey, nip19 } from "nostr-tools";
import { identifierHash, passwordSecret, decryptSecret } from "./my-client"; // your impl

test("identifierHash golden vector", async () => {
  expect(await identifierHash("alice@example.com")).toBe(
    "ff8d9819fc0e12bf0d24892e45987e249a28dce836a85cad60e28eaaa8c6d976",
  );
});

test("passwordSecret golden vector", async () => {
  expect(await passwordSecret("alice@example.com", "correct horse battery staple")).toBe(
    "bf4bf9a5ecfec3f96390af8783cf5b68caea179bf505719236c35660e85ee98c",
  );
});

test("decrypt golden ncryptsec to expected npub", () => {
  const ncryptsec =
    "ncryptsec1qggxyu3gpqkxlwjylnz4m29vg7arrdqltjzgyxu6wd672zpq70n5lzl8vreclge95mpsywad6xt5fer97jjw4samcswf8x2hshyvp02agdvacrlz86a8tckwuph92p4ahkxdufm4mayhs50hfusxdesn";
  const secret = decryptSecret(ncryptsec, "yo", "123");
  expect(nip19.npubEncode(getPublicKey(secret))).toBe(
    "npub19e9l920pdsqlz78yz3fl6auwl0pfzrz33w9szpyxw550c2rpxzlsgkrjtz",
  );
});
```

## Notes for integrators

- **No recovery.** Both the identifier and the password are user-held secrets.
  Losing either loses the account — the server cannot decrypt, cannot reset, and
  cannot even remind a user of their identifier (it has only the hash). Build
  your UX to push both into a password manager, and offer a one-time
  `nsec` / `ncryptsec` export at creation.
- **The identifier is a secret-by-convention.** Its privacy is what makes it
  defense-in-depth on top of the password. Let users pick any string; disclose
  the trade-off, do not enforce rules (enforcement creates false confidence).
- **Don't try to detect account existence.** `login` returns `401` for both "no
  such account" and "wrong password" — on purpose.

[NIP-49]: https://nips.nostr.com/49
