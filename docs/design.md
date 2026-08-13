# keys.justworks — Design

A non-custodial Nostr key locker. The server stores an encrypted private key
(`ncryptsec`) and serves it to the user on demand; the user decrypts and signs
**locally**. The server can never produce a plaintext key and cannot link an
account to a Nostr identity.

## TL;DR

- The encrypted blob is a **[NIP-49] `ncryptsec`** — don't invent a format.
- The server is a **keyless locker**: it stores `{ H(identifier), argon2(scrypt(password)), ncryptsec }` and nothing more. The raw password never reaches it — the client sends a memory-hard `scrypt(password)` for auth, which the server re-hashes with argon2.
- The `ncryptsec` passphrase is **`identifier ‖ password`**, derived client-side. The identifier is the **keystone**: it is only ever sent to the server as `H(identifier)`, so the server is blind to it.
- Three components: a **Rust server** (sqlite + REST), a **browser extension** (NIP-07 signer), and a **website** (onboarding + login + NIP-46 remote signer).
- **No recovery**, by design. The value proposition is *availability everywhere*, not *reset*. Both identifier and password are user-held; losing either loses the account.

## Background

Nostr onboarding has a chronic custody-vs-UX tension. Web2 users expect
email/password login and password recovery; Nostr makes the user responsible for
their own `nsec`, and losing it means losing their identity, followers, and
reputation. Prior experiments (`nsecbunker`, `nsec.app`) improved UX by storing
keys server-side and signing remotely, but they **degrade to custody**: the
service holds plaintext keys and signs on the user's behalf, making the server a
high-value honeypot.

This project takes the UX half of that idea and removes the custody: the server
stores only an **encrypted** blob and never signs anything. The user decrypts
and signs locally, from any device.

## Goals

- **Non-custodial.** The server can never produce a plaintext `nsec`, even if fully compromised by a passive breach.
- **Available everywhere.** The user can retrieve their `ncryptsec` from any device with their identifier and password.
- **Privacy-preserving.** The server cannot link an account to a Nostr `npub`.
- **Familiar UX.** Login feels like email + password.
- **Interoperable.** Use existing NIPs ([NIP-07], [NIP-46], [NIP-49]) rather than inventing protocols.

## Non-goals (for the MVP)

- Password / key recovery. Deliberately out of scope.
- Server-side signing of any kind.
- A custom key-encryption format.
- Browser extension as a NIP-46 bunker (later).
- iframe-based `window.nostr` injection (dropped).
- OAuth login (later, as an access gate only).
- Social recovery / Shamir shards (later).

## Threat model

Two distinct adversaries, with distinct defenses:

| Adversary | What they get | Defense |
|---|---|---|
| **Static breach** (DB leak) | `H(identifier)`, `argon2(scrypt(password))`, `ncryptsec` | Strong password + scrypt KDF cost (the blob's own NIP-49 scrypt is the gate; the stored verifier adds a costlier `argon2(scrypt(pw))` to crack). The identifier-in-passphrase adds a second secret to recover, *if* it is high-entropy and stored only hashed. |
| **Malicious operator** (reads login traffic / own DB; pushes malicious page JS) | `H(identifier)` (crackable if low-entropy), `scrypt(password)` (memory-hard — *not* the raw password), and the `ncryptsec` | The **keystone property**, restored by the client-derived auth secret: to form `identifier ‖ password` the operator must invert the memory-hard `scrypt(password)` (the raw password is never on the wire), reducing them to the **static-breach floor** regardless of identifier entropy. (Operator-resistance is *not* input isolation — a malicious *page* can still read the password as typed; that is perimeter-hardened on the website and fully isolated on the extension.) |

Primary threat = **static breach**. It is held by the password alone; the
identifier is defense-in-depth on top of it.

## Core design: the keystone

The `ncryptsec` is encrypted with a passphrase of **`identifier ‖ password`**,
concatenated unambiguously with a byte-length prefix on the identifier
(`dec(byteLen(identifier)) ‖ ":" ‖ identifier ‖ password`), derived
client-side per [NIP-49] (scrypt + XChaCha20-Poly1305).

The **identifier is the keystone**: it is the one secret the server is blind to.
Concretely, the identifier is *never* sent or stored in plaintext anywhere —
only as `H(identifier)` (a non-invertible hash, computed client-side, at both
registration and login). The server stores and looks up accounts by `H(identifier)`.

Why this works:

- **Static breach.** To derive the scrypt key, the attacker must recover the
  literal string `identifier ‖ password`. Cracking the stored
  `argon2(scrypt(password))` alone is no longer sufficient — they must *also*
  invert `H(identifier)` to recover the identifier, which is infeasible if the
  identifier is high-entropy. (In practice they crack the blob's own NIP-49
  scrypt on `identifier ‖ password` directly — that is the floor.)
- **Malicious operator.** The operator sees `H(identifier)` (crackable if the
  identifier is low-entropy) and `scrypt(password)` — **not** the raw password
  (see "Client-derived auth secret" below). To decrypt the `ncryptsec` they must
  invert the memory-hard `scrypt(password)` *and* recover the identifier, so the
  floor is the password + scrypt cost — equal to the static-breach floor.

This achieves operator-resistance **without a PAKE** — by splitting the secret
and keeping half server-blind, rather than running an OPAQUE handshake. A PAKE
remains an optional future hardening, not a requirement.

### Conditions (these are invariants of the security model)

1. The identifier is sent/stored **only as `H(identifier)`**, at registration *and* login *and* on every subsequent request. One plaintext leak anywhere and the keystone is gone.
2. The passphrase concatenation is **unambiguous** (a `id="ab", pw="cd"` vs `id="a", pw="bcd"` collision would be a silent, miserable bug). Resolved by byte-length-prefixing the identifier.
3. The identifier is high-entropy **if the user wants its full benefit**. (See "UX stance" — we disclose, we do not enforce.)

## Architecture

One conceptual keyholder, three thin surfaces. The crypto is reviewed once and
reused — via `nostr` (Rust) on the server side and `nostr-tools`
(`nostr-tools/nip49`) on the client surfaces, both implementing [NIP-49]
with default `log_n = 16`.

```
                ┌─────────────────────────────────────┐
                │   ncryptsec server (Rust, sqlite)   │
                │   keyless locker. REST API.         │
                │   stores H(id), argon2(pw), blob    │
                └────────────┬────────────────────────┘
                             │ REST (login → fetch ncryptsec)
              ┌──────────────┴──────────────┐
              ▼                             ▼
   ┌─────────────────────┐       ┌──────────────────────────┐
   │ browser extension   │       │ website                  │
   │ JS, NIP-07 signer   │       │ JS, onboarding + login + │
   │ isolated input +    │       │ NIP-46 remote signer     │
   │ isolated keyholder  │       │ Worker-isolated keyholder│
   └─────────────────────┘       └──────────────────────────┘
```

- **Server** never decrypts, never sees the plaintext identifier, and **never sees the plaintext password**: the client sends a memory-hard `scrypt(password)`; the server re-hashes that with argon2 for the stored verifier. (A full PAKE, which would also close online replay of the derived secret, is a roadmap option, not required for the floor.)
- **Extension** holds the decrypted key in an isolated context and exposes `window.nostr` ([NIP-07]) to the browser's clients. Strongest surface — both input and keyholding are isolated from page JS.
- **Website** holds the decrypted key in a Web Worker and exposes a [NIP-46] bunker for any client (including other devices). Deliberately the weaker surface; the extension is preferred wherever available.

## Key provenance

Where does the `ncryptsec` come from before it is uploaded? Two flows, both
supported:

### Generate on demand (default)

During onboarding, the web app or extension generates a fresh secp256k1 keypair
using a **CSPRNG** (`crypto.getRandomValues` / Web Crypto — never `Math.random`),
encrypts the `nsec` into an `ncryptsec` with the passphrase `identifier ‖ password`,
and uploads it. The user picks an identifier and password and receives a Nostr
identity without ever handling a raw key. The generated `npub` (public, safe) is
shown so the user knows and can share their identity.

Generation is low-risk regardless of surface: the key is brand-new and unreputed,
so a compromise during the brief encryption window costs little — the user simply
regenerates before using it.

### Import existing nsec (advanced)

For users who already have a Nostr identity and will not switch if it means
abandoning followers/reputation: they provide their `nsec`, the app wraps it into
an `ncryptsec` with the passphrase, and uploads.

**Trust boundary matters here.** Import puts the raw `nsec` in memory briefly
before encryption. In the **extension** that memory is isolated — fine. On the
**website** the `nsec` is in page JS during import, so an XSS / compromised
dependency at that moment leaks an *established* key. Steer imports toward the
extension; website import is convenience with acknowledged risk. This mirrors
the signing trust boundary: the extension is the safer surface for any operation
that touches a raw key.

**Hardening website import against XSS (the highest-stakes page-JS exposure).**
Import puts an *established, reputed* key in page JS — unlike generate (a
brand-new unreputed key, low cost to leak). The complete defense is **input
isolation** (extension / vault iframe / WebAuthn), which is deferred on the
website; the mitigations below are **probability reduction**, and the residual
is stated honestly:

1. **Prefer the extension for import** — the only place the nsec is safe from
   page JS. Website import carries a loud gate: *"importing an established key
   here is the riskiest operation on this site; use the extension if you can."*
2. **Strict CSP** (the load-bearing mitigation) — `script-src 'self'` with no
   inline scripts; blocks injected scripts, which is what makes the brief
   page-JS window safe.
3. **Self-host everything** — no CDNs, no third-party scripts; no supply-chain
   script vector.
4. **Encrypt in the Worker, not page JS** — the Worker receives
   `{nsec, identifier, password}`, runs the NIP-49 encrypt, returns the
   `ncryptsec`, and wipes; page-JS exposure shrinks to the instant between
   reading the input and `postMessage`.
5. **Brief-window discipline** — read → post → clear the input and drop the
   reference immediately; never persist the nsec in reactive state or logs.
6. **Dependency hygiene** — the residual CSP cannot cover: a malicious
   *trusted* dependency (compromised `nostr-tools`, malicious build plugin)
   runs as `'self'`. Pin the lockfile, audit, minimize. Only input isolation
   fixes this class.

### One-time export (consistent with "no recovery")

At creation (generate or import), offer the user a single chance to view/export
their raw `nsec` or the `ncryptsec` itself, with strong warnings. This is **not
server recovery** — it is *user-managed* backup. It is the honest way for a user
who later forgets their password to still survive, without the service ever
holding anything recoverable. Offer it, do not force it; the default is "the
locker is your backup."

## Data model

The server stores exactly three fields per account, plus bookkeeping:

| Field | Purpose | Notes |
|---|---|---|
| `identifier_hash` | Account locator; primary key | `H(identifier)`, computed client-side. Never the plaintext. |
| `password_verifier` | Login check | `argon2(password_secret)`, where `password_secret` is the client-derived `scrypt(password)` (server-hashed; never the wire value). |
| `ncryptsec` | The encrypted private key | NIP-49 blob, `ncryptsec1…`, passphrase = `identifier ‖ password`. |

Plus: created/updated timestamps, a KDF/version byte on the blob for future
upgrades, login-rate-limit counters. **No plaintext identifier, no plaintext
password, no npub, no email ever stored.**

SQLite is sufficient for the MVP.

The server **cannot** learn the account's `npub`: the `ncryptsec` is AEAD-encrypted
and the `npub` is not derivable from `{identifier_hash, password_verifier, ncryptsec}`.
The server learns only human-account metadata (login times, source IPs, blob
existence) — never the Nostr identity.

## Security analysis

### Why the keystone holds

The security floor is **the password + scrypt cost** against a static breach.
The identifier is **defense-in-depth on top** of that floor: a bonus layer when
it is strong and kept server-blind, and *no worse than password-only* when it is
weak. The floor never drops because of the identifier.

### Client-derived auth secret

The raw password never leaves the client. For auth, the client derives
`password_secret = scrypt(password, salt = "keys.justworks-password-secret-v1:" ‖
identifier)` — memory-hard, `N=2¹⁶, r=8, p=1`, 32 bytes — and sends that. The
server applies argon2 on top and stores `argon2(password_secret)`; the wire value
is never what is in the DB. (Implemented in `@kj/core::passwordSecret`; a golden
vector locks the params/salt. Browser WebCrypto has no scrypt, hence
`@noble/hashes`.)

Two layers do different jobs: scrypt makes the *captured wire value* memory-hard
to invert (so a traffic-logging operator can't recover the password); argon2
makes the *stored verifier* costly to crack and unusable as a login credential on
a DB leak. The blob's own NIP-49 scrypt (on `identifier ‖ password`) is a third,
independent gate — the raw password is kept client-side solely for it.

Not a PAKE: the operator still gets an offline-crackable, replayable verifier.
It raises the operator floor back to the static-breach floor and removes the raw
password from the wire (killing cross-site reuse as a bonus).

### Why no PAKE is needed for the floor

The client sends `password_secret = scrypt(password)` (memory-hard) for auth,
never the raw password. An operator who captures login traffic therefore gets
`scrypt(password)`, not the password — to form the blob passphrase they must
invert that memory-hard secret *and* crack `H(identifier)` for the identifier.
The floor is the password + scrypt cost, **independent of identifier entropy**.

(This restores a property the design previously only *asserted*. An earlier
draft sent the raw password to the server and claimed the operator still
couldn't decrypt because `H(identifier)` is "non-invertible" — but an unsalted
SHA-256 of a guessable email is trivially crackable, so with the raw password in
hand the operator could form the passphrase for low-entropy identifiers. Sending
`scrypt(password)` instead makes the claim actually hold.)

A PAKE (OPAQUE) remains an optional *future* hardening: it would also stop the
derived secret being **replayable** for online account actions by whoever
captures it. (Against the operator itself this is moot — they control the server
— so replay only matters to a third party that captured logged traffic.) That is
a narrower residual than "raw password on the wire," hence deferred.

The other residual operator threat is *malicious page JS reading the identifier
and password as typed*; that is input isolation, not a PAKE — addressed by
perimeter defense (strict CSP, self-hosted bundle) on the website and by the
extension's isolated context, where it does not exist.

### Why the extension is the stronger surface

Identifier and password are typed into the extension's own isolated UI; page JS
never sees them. On the website, those inputs live in page JS — defended by
**perimeter defense** (strict CSP, self-hosted bundle, no third-party scripts),
not by isolation. The residual risk (a compromised trusted dependency, or any
XSS that gets past CSP) is why import steers toward the extension. Hence: *use
the extension when you can.*

## Component specifications

### 1. ncryptsec server (Rust)

- **Stack:** Rust, `axum` + `sqlx` (sqlite, runtime queries) + `argon2`, with the static site embedded by `rust-embed`. The server does not decrypt and treats `ncryptsec` as an opaque stored blob (prefix check only).
- **Responsibility:** store and serve `ncryptsec` blobs behind identifier/password auth. Never decrypt. Never sign.
- **Auth:** **stateless**. Every request that touches an account re-verifies `{ identifier_hash, password }` inline against the stored verifier; `POST /login` returns the `ncryptsec` directly. No sessions, no tokens — nothing to steal, store, or expire. The server is a locker, not a session host.
- **Hardening:**
  - Per-account **and** per-IP login rate-limiting (the only online brute-force defense). Deferred past first cut; `argon2`'s deliberately slow verify is the floor throttle meanwhile.
  - TLS everywhere; HSTS.
  - Strong `argon2id` parameters; never lower them.
  - A version byte on the blob for future NIP-49 / KDF upgrades.

#### REST sketch

```
POST /api/register     { identifier_hash, password, ncryptsec }
POST /api/login        { identifier_hash, password }                → { ncryptsec }
PUT  /api/blob         { identifier_hash, password, new_ncryptsec [, new_password] }
DELETE /api/account    { identifier_hash, password }
```

The API is namespaced under `/api/*` so it coexists with the bundled static site served at `/*` by the same Rust binary — same-origin by default, with cross-origin access for third-party integrators opt-in via `ALLOWED_ORIGINS` (see [architecture.md](architecture.md)). `identifier_hash` is computed client-side as `H(identifier)`; the server never receives the plaintext identifier. **The server owns argon2**: `register` and `PUT` receive the client-derived `password_secret` (`scrypt(password)` — the raw password never reaches the server) and hash it server-side — never a client-supplied verifier, which would let a client store a hash for a different password. Every endpoint except `register` verifies `argon2(password_secret)` against the stored `password_verifier` inline — there is no separate auth layer and no session (PAKE upgrade deferred). `PUT /api/blob` covers both a plain re-encrypt and a password change: the client re-encrypts the `ncryptsec` with the new passphrase and, when rotating the password, also supplies `new_password_secret` (`scrypt(new_password)`) so both stored fields update atomically.

### 2. Browser extension (JS, NIP-07)

- **Stack:** TypeScript, `nostr-tools` (`nip49`), WebExtensions (MV3).
- **Responsibility:** the secure signing surface. Login → fetch `ncryptsec` → decrypt → hold key → expose `window.nostr` ([NIP-07]: `getPublicKey`, `signEvent`, `getRelays`, `nip04`/`nip44` as needed).
- **Isolation:** both identifier/password input (extension UI) and the decrypted key (extension background / isolated context) are out of page-JS reach.
- **MVP scope:** NIP-07 only. Not a NIP-46 bunker (later).

### 3. Website (JS, NIP-46 bunker + onboarding)

- **Stack:** TypeScript, `nostr-tools` (`nip49`, `nip46`), a Web Worker keyholder.
- **Responsibility:** onboarding, login, and a [NIP-46] remote signer (bunker). This is also the **primary surface on mobile** (where browser extensions are largely unavailable) — not merely a convenience fallback.
- **Keyholder isolation:** the decrypted `nsec` lives **only in a Web Worker**.
  The page exchanges sign-requests and signatures with the worker, never the
  key, and no op in the worker protocol returns the raw secret — so a page
  compromise becomes a *live signing oracle for the session*, not silent key
  theft, and a generous idle auto-lock (below) shrinks that window. This is the
  durable design, not a placeholder.
- **Input isolation:** the Worker is downstream of the input and therefore
  **cannot** isolate identifier/password entry. That residual gap (page JS
  reading secrets as typed) is covered on the website by **perimeter defense**
  (strict CSP, self-hosted bundle, no third-party scripts) plus the **extension**
  for users who want the strong surface. A sandboxed vault iframe that also
  isolates input is a *documented future option*, not the active plan (see
  "Documented future options").
- **Perimeter defense (the practical XSS mitigation):** a strict
  `Content-Security-Policy` emitted as a **header** by the Rust server
  (`script-src 'self'`, `object-src 'none'`, `base-uri 'none'`,
  `frame-ancestors 'none'`, `connect-src 'self'` + relay `wss:` origins for
  NIP-46). The only inline `<script>` in the built HTML is SvelteKit's
  bootstrap loader; the server hashes it from the embedded `index.html` and
  includes `'sha256-<hash>'` in `script-src`, so no `'unsafe-inline'` is needed
  (`modulePreload.polyfill = false` avoids an extra inline script). Everything is
  self-hosted and same-origin — no CDNs, no third-party scripts, so no
  supply-chain script vector. This is what makes the brief windows where a
  secret passes through page JS (generate, import, unlock) safe: with no XSS
  installed, the window is benign.
- **Idle auto-lock:** the Worker wipes the held key after a generous idle
  interval (~30 min, configurable) with no keyholder messages, then notifies
  the page so the UI reflects the lock. Generous on purpose to avoid re-login
  footguns; a page reload already drops the key (never persist).

## Hardening summary

| Surface | Input isolation | Key isolation | Status |
|---|---|---|---|
| Extension | isolated (extension UI) | isolated (extension context) | MVP |
| Website | perimeter (strict CSP, self-hosted, no 3rd-party scripts) + extension nudge for the strong surface | Web Worker + generous idle auto-lock | MVP |

The sandboxed vault iframe (input + key isolation in a separate cross-origin
`vault.<origin>`) is a documented future option, not the active roadmap — see
"Documented future options."

General rules across surfaces: per-sign prompts, generous session TTL with
wipe-on-idle, never persist the decrypted key (re-derive each session).

## Recovery posture

**None, by design.** The product value is *availability of the encrypted blob
from any device*, not *reset*. The server cannot recover a key because it cannot
decrypt; it cannot remind you of the identifier because it only has its hash.

Consequences, stated plainly to users:

- Both **identifier and password** are user-held secrets. Losing either loses the account.
- Onboarding pushes both strings into a **password manager** as the happy path.
- Users are encouraged to **export the `ncryptsec`** to independent backup(s) (password manager, a second device). Redundancy without custody.

## UX stance: identifier & password

The identifier is **defense-in-depth, not the floor**. We disclose this honestly:

- The product is framed around **"a strong password is what protects you; a private identifier adds a layer if you keep it private."**
- Users may use any string as an identifier (an email they remember, a username, anything). We do **not** enforce length or reject patterns — enforcement creates false positives, is trivially gamed, and breeds false confidence.
- The identifier's benefit is conditional on it being private; users who pick a public/guessable identifier get password-only protection, clearly stated. No footguns introduced either way.

## MVP scope

1. **Rust server** — sqlite + REST as above, argon2 verifier, rate-limited login, keyless.
2. **Browser extension** — NIP-07 signer, isolated input + keyholding, fetches `ncryptsec` on login.
3. **Website** — onboarding + login + NIP-46 bunker, Worker-isolated keyholder.

That delivers the full value proposition: keys everywhere, non-custodial, server cannot read them or name you.

## Roadmap (post-MVP, in rough order)

1. **PAKE auth (OPAQUE)** — optional; removes password exposure at login.
2. **Extension as NIP-46 bunker** — reuse the held key to serve Nostr Connect for other devices. (Note MV3 service-worker lifecycle fights persistent relay connections; budget for keepalive.)
3. **Passkey + WebAuthn PRF** — derive the blob encryption key from a hardware authenticator; resists offline brute-force and improves UX. Re-wrap path needed for credential resets. This is the **preferred future input-isolation upgrade** (removes the password from JS entirely) and supersedes the iframe option for that gap.
4. **OAuth** — as an **access gate** only. OAuth can prove account ownership to release a blob, but it **cannot** become the decryption secret without re-introducing custody (the OAuth provider could then authenticate as you). A user-held `(identifier, password)` must remain.
5. **Social recovery / Shamir shards** — split the key M-of-N across guardians for users who want recovery at the cost of complexity.

## Documented future options (not the active plan)

Recorded so a decision is not silently re-litigated. Each is a viable upgrade
kept off the roadmap for a stated reason.

- **Sandboxed vault iframe for input + key isolation.** Move the keyholder (and
  secret *input* — identifier/password/nsec) into a sandboxed cross-origin
  iframe (`vault.<origin>`, `sandbox="allow-scripts"` without
  `allow-same-origin`), bridged by `postMessage` with strict
  `targetOrigin`/`event.origin` checks, approvals rendered in a popup to the
  vault origin. This is the only website-side path that isolates *input* from
  page JS (closing the residual malicious-page-JS / keylogger gap), and it
  would make per-sign approvals un-bypassable. **Why deferred:** it defends a
  secondary threat (the keystone is defense-in-depth, not the floor; the
  primary threat is static breach, held by password + scrypt), the website is
  "deliberately the weaker surface" with the extension as the strong one, and
  the iframe carries real cost (cross-origin sandbox UX, no `localStorage`,
  popup approvals). The `postMessage` protocol is kept transport-agnostic so
  this remains a drop-in upgrade. **Revisit if:** operator-resistance-on-the-web
  becomes a first-class goal, or per-sign approval integrity for the NIP-46
  bunker demands it. **Note:** WebAuthn PRF (roadmap) is a strictly better
  input-isolation upgrade and would likely land first.

## Open build-time questions

These are implementation choices, not design decisions — they get resolved during scaffolding:

- Exact `axum` route shapes and error model (stateless: every call re-verifies `identifier_hash` + `password`).
- Argon2 parameters (memory/time/parallelism) and whether to expose tuning.
- `H(identifier)` choice: a plain hash, or a memory-hard hash for offline-cracking resistance of the locator itself (trade-off: login cost).
- NIP-46 session model in the website: how long the unlocked key lives in the Worker, idle timeout, per-tab vs. persisted.
- Extension build/packaging and browser-store distribution.
- Which NIP-46 client surface area to support first (event kinds, `getPublicKey`, `signEvent`, encryption helpers).

## References

- [NIP-07] `window.nostr` — https://nips.nostr.com/7
- [NIP-46] Nostr Connect (remote signer / bunker) — https://nips.nostr.com/46
- [NIP-49] Private Key Encryption (`ncryptsec`) — https://nips.nostr.com/49
- rust-nostr `nip49` (`EncryptedSecretKey`) — https://docs.rs/nostr/latest/nostr/nips/nip49/
- `nostr-tools` `nip49` — https://github.com/nbd-wtf/nostr-tools (import from `nostr-tools/nip49`)
