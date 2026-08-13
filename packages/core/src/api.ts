/**
 * keys.justworks — REST client for the locker API.
 *
 * Same-origin (`/api/*`) by default — the website is bundled into the server
 * binary (one origin). Third-party apps that embed keys.justworks as their key
 * backend call cross-origin: set the base with `setApiBase(...)` and they're in
 * — the server runs an open CORS policy (`*`) so any origin may integrate
 * (safe because auth is body-only; see docs/architecture.md). First-party
 * surfaces (`web`, `extension`) and integrators share this so the JSON field
 * names (`identifier_hash`, `password_secret`, `ncryptsec`) live in one place
 * and never drift.
 */

let API_BASE = "/api";

/**
 * Override the API base for cross-origin integrators, e.g.
 * `setApiBase("https://keys.justworks.cash/api")`. Same-origin (`/api`) when
 * unset. Integrators MUST also use `@kj/core` for `identifierHash`/
 * `passwordSecret`/`encryptSecret`/`decryptSecret` — the byte-identical crypto
 * contract is what lets a user register in one app and decrypt in another.
 */
export function setApiBase(base: string): void {
  API_BASE = base;
}

/** Typed error from the locker API. `code` is stable for UI branching. */
export class ApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Fetch wrapper that aborts after `REQUEST_TIMEOUT_MS`, so an unreachable or
 * misconfigured API base fails fast with a clear `unreachable` error instead of
 * hanging the caller (a cross-origin surface like the extension can otherwise
 * wait tens of seconds on DNS/TCP timeout before the OS gives up).
 */
const REQUEST_TIMEOUT_MS = 15_000;

async function request(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    throw new ApiError(
      "unreachable",
      `Could not reach the server. Check the API base. (${e instanceof Error ? e.message : "network error"})`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Register a new account. Throws `ApiError("conflict")` if it already exists.
 * `passwordSecret` is the client-derived `scrypt(password)` — never the raw
 * password (see `passwordSecret` in index.ts). */
export async function register(args: {
  identifierHash: string;
  passwordSecret: string;
  ncryptsec: string;
}): Promise<void> {
  const res = await request(`${API_BASE}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      identifier_hash: args.identifierHash,
      password_secret: args.passwordSecret,
      ncryptsec: args.ncryptsec,
    }),
  });
  if (res.status === 409) {
    throw new ApiError("conflict", "An account with that identifier already exists.");
  }
  if (!res.ok) {
    throw new ApiError("register-failed", `Registration failed (${res.status}).`);
  }
}

/** Update the stored `ncryptsec` (re-encrypted blob). Re-auths with the
 * CURRENT `passwordSecret`. Pass `newPasswordSecret` to also rotate the
 * password (the server swaps the stored verifier); omit it to replace the
 * blob under the same password. The client must re-encrypt `newNcryptsec`
 * itself — the server can't (no plaintext key, no passphrase). */
export async function updateBlob(args: {
  identifierHash: string;
  passwordSecret: string; // current password, for auth
  newNcryptsec: string;
  newPasswordSecret?: string; // present on a password change
}): Promise<void> {
  const res = await request(`${API_BASE}/blob`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      identifier_hash: args.identifierHash,
      password_secret: args.passwordSecret,
      new_ncryptsec: args.newNcryptsec,
      new_password_secret: args.newPasswordSecret, // omitted by JSON.stringify when undefined
    }),
  });
  if (res.status === 401) {
    throw new ApiError("unauthorized", "Wrong identifier or password.");
  }
  if (!res.ok) {
    throw new ApiError("update-failed", `Update failed (${res.status}).`);
  }
}

/** Permanently delete the account (the encrypted blob). Re-auths with the
 * current `passwordSecret`. The key is gone from this server — but a user who
 * saved their nsec backup still owns the key elsewhere. No recovery by design. */
export async function deleteAccount(args: {
  identifierHash: string;
  passwordSecret: string;
}): Promise<void> {
  const res = await request(`${API_BASE}/account`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      identifier_hash: args.identifierHash,
      password_secret: args.passwordSecret,
    }),
  });
  if (res.status === 401) {
    throw new ApiError("unauthorized", "Wrong identifier or password.");
  }
  if (!res.ok) {
    throw new ApiError("delete-failed", `Delete failed (${res.status}).`);
  }
}

/** Log in and retrieve the stored `ncryptsec`. Throws `ApiError("unauthorized")`.
 * `passwordSecret` is the client-derived `scrypt(password)` — never the raw
 * password. */
export async function login(args: {
  identifierHash: string;
  passwordSecret: string;
}): Promise<string> {
  const res = await request(`${API_BASE}/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      identifier_hash: args.identifierHash,
      password_secret: args.passwordSecret,
    }),
  });
  if (res.status === 401) {
    throw new ApiError("unauthorized", "Wrong identifier or password.");
  }
  if (!res.ok) {
    throw new ApiError("login-failed", `Login failed (${res.status}).`);
  }
  return (await res.json()).ncryptsec as string;
}
