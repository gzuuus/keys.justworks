/**
 * keys.justworks — shared in-memory signer (consumed by `web` and `extension`).
 *
 * Pure crypto/sign dispatch with no I/O: holds a decrypted secp256k1 secret in
 * memory and serves the NIP-07 surface (`getPublicKey`/`signEvent`/`nip04`/
 * `nip44`) plus lifecycle (unlock/lock/status) and onboarding (create/import/
 * reencrypt/exportNsec). The byte-identical crypto primitives
 * (`identifierHash`/`passwordSecret`/`encryptSecret`/`decryptSecret`) stay in
 * `index.ts`; this module composes them with `nostr-tools` signing.
 *
 * Extracted so the two surfaces share one dispatch path instead of duplicating
 * it (design.md: the extension "mirrors the NIP-07 `window.nostr` surface").
 * The website's `keyholder/core.ts` is the same logic and may re-export this
 * later; the names are surface-neutral on purpose.
 *
 * Pure on purpose: no `Worker`/`postMessage`/`browser`/DOM here, so the
 * dispatch is unit-testable without a worker or extension harness. Each surface
 * wraps it with its own I/O adapter (web: `postMessage` Worker; extension:
 * `browser.runtime` service-worker messages).
 */
import type { EventTemplate, VerifiedEvent } from "nostr-tools";
import { finalizeEvent, generateSecretKey, getPublicKey, nip04, nip44 } from "nostr-tools";
import * as nip19 from "nostr-tools/nip19";
import { decryptSecret, encryptSecret, passwordSecret } from "./index";

/** Each operation maps to its request payload and result type. */
export interface SignerOps {
  /** Stateless CPU offload: derive the client auth secret (scrypt). Does not
   * touch any held key. */
  passwordSecret: { req: { identifier: string; password: string }; res: string };
  /** Registration: generate a fresh key, wrap it as an ncryptsec, and derive the
   * auth secret + npub/nsec. The raw 32 bytes never leave via the result (only
   * the bech32 backup, which the user must see once anyway). Does not hold. */
  create: {
    req: { identifier: string; password: string };
    res: { ncryptsec: string; npub: string; nsec: string; passwordSecret: string };
  };
  /** Decrypt an ncryptsec under `identifier ‖ password` and hold it. */
  unlock: {
    req: { ncryptsec: string; identifier: string; password: string };
    res: { npub: string };
  };
  /** Re-wrap the held key under a new passphrase (password change). Requires an
   * unlocked key; returns the new ncryptsec. The held secret itself is
   * unchanged (same key, new wrapper). */
  reencrypt: {
    req: { identifier: string; newPassword: string };
    res: { ncryptsec: string };
  };
  /** One-shot: decode an existing nsec, wrap it as an ncryptsec, and derive the
   * auth secret + npub. Mirrors `create` minus key generation. Does not hold. */
  import: {
    req: { nsec: string; identifier: string; password: string };
    res: { ncryptsec: string; npub: string; passwordSecret: string };
  };
  lock: { req: void; res: { locked: true } };
  status: { req: void; res: { unlocked: boolean; npub: string | null } };
  getPublicKey: { req: void; res: string };
  /** Export the held secret as an nsec for at-will backup. Requires an unlocked
   * key. Re-exposure is deliberate and user-initiated. */
  exportNsec: { req: void; res: { nsec: string } };
  signEvent: { req: { event: EventTemplate }; res: VerifiedEvent };
  "nip04.encrypt": { req: { pubkey: string; plaintext: string }; res: string };
  "nip04.decrypt": { req: { pubkey: string; ciphertext: string }; res: string };
  "nip44.encrypt": { req: { pubkey: string; plaintext: string }; res: string };
  "nip44.decrypt": { req: { pubkey: string; ciphertext: string }; res: string };
}

export type SignerOp = keyof SignerOps;

/** Wire request: discriminated union tagged by `op`. */
export type SignerReq = {
  [K in SignerOp]: { id: string; op: K; payload: SignerOps[K]["req"] };
}[SignerOp];

export type SignerRes =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string };

/**
 * Idle auto-lock interval (generous, to avoid re-login footguns). The holder
 * wipes the held key after this long with no activity. Shared so both surfaces
 * default to the same session window.
 */
export const IDLE_LOCK_MS = 30 * 60 * 1000;

/**
 * Stateful signer: holds the secret in memory, dispatches one request at a time.
 * Never throws from `handle` — failures come back as `{ ok: false, error }`.
 */
export class SignerCore {
  #secret: Uint8Array | null = null;

  /** Is a key currently held? */
  get unlocked(): boolean {
    return this.#secret !== null;
  }

  /** Wipe the held key. Used by the `lock` op and by idle auto-lock. */
  lock(): void {
    this.#secret?.fill(0);
    this.#secret = null;
  }

  /** Handle a wire request, returning the wire response. */
  async handle(req: SignerReq): Promise<SignerRes> {
    try {
      return { id: req.id, ok: true, result: await this.#dispatch(req) };
    } catch (e) {
      return { id: req.id, ok: false, error: e instanceof Error ? e.message : "signer error" };
    }
  }

  #require(): Uint8Array {
    if (!this.#secret) throw new Error("locked: call unlock first");
    return this.#secret;
  }

  async #dispatch(req: SignerReq): Promise<unknown> {
    switch (req.op) {
      case "passwordSecret": {
        const { identifier, password } = req.payload;
        return passwordSecret(identifier, password);
      }
      case "create": {
        const { identifier, password } = req.payload;
        const secret = generateSecretKey();
        try {
          const pubkey = getPublicKey(secret);
          return {
            ncryptsec: encryptSecret(secret, identifier, password),
            npub: nip19.npubEncode(pubkey),
            nsec: nip19.nsecEncode(secret),
            passwordSecret: await passwordSecret(identifier, password),
          };
        } finally {
          secret.fill(0); // generated key never leaves as raw bytes
        }
      }
      case "unlock": {
        const { ncryptsec, identifier, password } = req.payload;
        const secret = decryptSecret(ncryptsec, identifier, password);
        this.#secret?.fill(0); // wipe any previously-held key
        this.#secret = secret;
        return { npub: nip19.npubEncode(getPublicKey(secret)) };
      }
      case "reencrypt": {
        const { identifier, newPassword } = req.payload;
        return { ncryptsec: encryptSecret(this.#require(), identifier, newPassword) };
      }
      case "import": {
        const { nsec, identifier, password } = req.payload;
        const decoded = nip19.decode(nsec); // throws on malformed bech32
        if (decoded.type !== "nsec") throw new Error("expected an nsec");
        const secret = decoded.data;
        try {
          const pubkey = getPublicKey(secret);
          return {
            ncryptsec: encryptSecret(secret, identifier, password),
            npub: nip19.npubEncode(pubkey),
            passwordSecret: await passwordSecret(identifier, password),
          };
        } finally {
          secret.fill(0); // never hold the imported key
        }
      }
      case "lock":
        this.lock();
        return { locked: true as const };
      case "status":
        return this.#secret
          ? { unlocked: true, npub: nip19.npubEncode(getPublicKey(this.#secret)) }
          : { unlocked: false, npub: null };
      case "getPublicKey":
        return getPublicKey(this.#require());
      case "exportNsec":
        return { nsec: nip19.nsecEncode(this.#require()) };
      case "signEvent":
        return finalizeEvent(req.payload.event, this.#require());
      case "nip04.encrypt":
        return nip04.encrypt(this.#require(), req.payload.pubkey, req.payload.plaintext);
      case "nip04.decrypt":
        return nip04.decrypt(this.#require(), req.payload.pubkey, req.payload.ciphertext);
      case "nip44.encrypt": {
        const sk = this.#require();
        // nostr-tools nip44 is low-level: derive conversation key, then encrypt.
        return nip44.encrypt(
          req.payload.plaintext,
          nip44.getConversationKey(sk, req.payload.pubkey),
        );
      }
      case "nip44.decrypt": {
        const sk = this.#require();
        return nip44.decrypt(
          req.payload.ciphertext,
          nip44.getConversationKey(sk, req.payload.pubkey),
        );
      }
      default: {
        // Exhaustiveness guard: adding an op to SignerOps without a case here
        // is a compile error.
        const _: never = req;
        throw new Error(`unhandled op: ${JSON.stringify(_ as object)}`);
      }
    }
  }
}
