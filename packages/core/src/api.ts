/**
 * keys.justworks — REST client for the locker API.
 *
 * Same-origin (`/api/*`), so no CORS — the website is bundled into the server
 * binary (one origin). Both surfaces (`web`, `extension`) share this so the
 * JSON field names (`identifier_hash`, `password`, `ncryptsec`) live in one
 * place and never drift.
 */

const API_BASE = "/api";

/** Typed error from the locker API. `code` is stable for UI branching. */
export class ApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/** Register a new account. Throws `ApiError("conflict")` if it already exists. */
export async function register(args: {
  identifierHash: string;
  password: string;
  ncryptsec: string;
}): Promise<void> {
  const res = await fetch(`${API_BASE}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      identifier_hash: args.identifierHash,
      password: args.password,
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

/** Log in and retrieve the stored `ncryptsec`. Throws `ApiError("unauthorized")`. */
export async function login(args: {
  identifierHash: string;
  password: string;
}): Promise<string> {
  const res = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      identifier_hash: args.identifierHash,
      password: args.password,
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
