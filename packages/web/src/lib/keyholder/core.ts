/**
 * keys.justworks — Web Worker keyholder: pure message handler.
 *
 * The page's single crypto Worker. Two jobs, both off the main thread:
 *  - key custody + NIP-07 signing — holds the decrypted secp256k1 secret in
 *    Worker memory only and serves `getPublicKey`/`signEvent`/`nip04`/`nip44`
 *    over a `postMessage` protocol, plus `unlock`/`lock`/`status` lifecycle;
 *  - CPU-bound offload — `passwordSecret` (scrypt auth secret) and `create`
 *    (generate + wrap a fresh key for registration) run here so they never
 *    freeze the UI. Neither touches the held key.
 *
 * Mirrors the NIP-07 `window.nostr` surface so the page client (and, later, an
 * injected `window.nostr` shim) speaks the same shape as a browser extension
 * signer.
 *
 * Pure on purpose: no `Worker`/`postMessage`/DOM here, so the dispatch logic is
 * unit-testable without a worker harness. The thin I/O adapters live in
 * `worker.ts` (Worker entry) and `client.ts` (page client).
 */
import type { EventTemplate, VerifiedEvent } from 'nostr-tools';
import { finalizeEvent, generateSecretKey, getPublicKey, nip04, nip19, nip44 } from 'nostr-tools';
import { decryptSecret, encryptSecret, passwordSecret } from '@kj/core';

/** Each operation maps to its request payload and result type. */
export interface KeyholderOps {
	/** Stateless CPU offload: derive the client auth secret (scrypt) off the main
	 * thread. Does not touch any held key. */
	passwordSecret: { req: { identifier: string; password: string }; res: string };
	/** Registration: generate a fresh key, wrap it as an ncryptsec, and derive the
	 * auth secret + npub/nsec — all in-Worker so the raw 32 bytes never touch page
	 * JS (only the bech32 backup leaves, which the user must see once anyway). Does
	 * not hold the key. */
	create: {
		req: { identifier: string; password: string };
		res: { ncryptsec: string; npub: string; nsec: string; passwordSecret: string };
	};
	unlock: {
		req: { ncryptsec: string; identifier: string; password: string };
		res: { pubkey: string };
	};
	/** One-shot: decode an existing nsec and wrap it into an ncryptsec inside the
	 * Worker (the raw established key never lingers in page JS). Does not hold. */
	import: {
		req: { nsec: string; identifier: string; password: string };
		res: { ncryptsec: string; pubkey: string };
	};
	lock: { req: void; res: { locked: true } };
	status: { req: void; res: { unlocked: boolean; pubkey: string | null } };
	getPublicKey: { req: void; res: string };
	signEvent: { req: { event: EventTemplate }; res: VerifiedEvent };
	'nip04.encrypt': { req: { pubkey: string; plaintext: string }; res: string };
	'nip04.decrypt': { req: { pubkey: string; ciphertext: string }; res: string };
	'nip44.encrypt': { req: { pubkey: string; plaintext: string }; res: string };
	'nip44.decrypt': { req: { pubkey: string; ciphertext: string }; res: string };
}

export type KeyholderOp = keyof KeyholderOps;

/** Wire request: discriminated union tagged by `op`. */
export type KeyholderReq = {
	[K in KeyholderOp]: { id: string; op: K; payload: KeyholderOps[K]['req'] };
}[KeyholderOp];

export type KeyholderRes =
	{ id: string; ok: true; result: unknown } | { id: string; ok: false; error: string };

/**
 * Idle auto-lock interval (generous, to avoid re-login footguns). The Worker
 * wipes the held key after this long with no keyholder messages, then notifies
 * the page. A page reload already drops the key (never persist).
 */
export const IDLE_LOCK_MS = 30 * 60 * 1000;

/** Unsolicited Worker → page notification (no request correlation). */
export type KeyholderNotification = { notification: 'auto-locked' };

/** Stateful keyholder: holds the secret, dispatches one request at a time. */
export class KeyholderCore {
	#secret: Uint8Array | null = null;

	/** Is a key currently held? (for tests / status) */
	get unlocked(): boolean {
		return this.#secret !== null;
	}

	/** Wipe the held key. Used by the `lock` op and by idle auto-lock. */
	lock(): void {
		this.#secret?.fill(0);
		this.#secret = null;
	}

	/** Handle a wire request, returning the wire response (never throws). */
	async handle(req: KeyholderReq): Promise<KeyholderRes> {
		try {
			return { id: req.id, ok: true, result: await this.#dispatch(req) };
		} catch (e) {
			return { id: req.id, ok: false, error: e instanceof Error ? e.message : 'keyholder error' };
		}
	}

	#require(): Uint8Array {
		if (!this.#secret) throw new Error('locked: call unlock first');
		return this.#secret;
	}

	async #dispatch(req: KeyholderReq): Promise<unknown> {
		switch (req.op) {
			case 'passwordSecret': {
				const { identifier, password } = req.payload;
				return passwordSecret(identifier, password);
			}
			case 'create': {
				const { identifier, password } = req.payload;
				const secret = generateSecretKey();
				try {
					const pubkey = getPublicKey(secret);
					return {
						ncryptsec: encryptSecret(secret, identifier, password),
						npub: nip19.npubEncode(pubkey),
						nsec: nip19.nsecEncode(secret),
						passwordSecret: await passwordSecret(identifier, password)
					};
				} finally {
					secret.fill(0); // generated key never leaves the Worker as raw bytes
				}
			}
			case 'unlock': {
				const { ncryptsec, identifier, password } = req.payload;
				const secret = decryptSecret(ncryptsec, identifier, password);
				this.#secret?.fill(0); // wipe any previously-held key
				this.#secret = secret;
				return { pubkey: getPublicKey(secret) };
			}
			case 'import': {
				const { nsec, identifier, password } = req.payload;
				const decoded = nip19.decode(nsec); // throws on malformed bech32
				if (decoded.type !== 'nsec') throw new Error('expected an nsec');
				const secret = decoded.data;
				try {
					return {
						ncryptsec: encryptSecret(secret, identifier, password),
						pubkey: getPublicKey(secret)
					};
				} finally {
					secret.fill(0); // never hold the imported key
				}
			}
			case 'lock':
				this.lock();
				return { locked: true as const };
			case 'status':
				return this.#secret
					? { unlocked: true, pubkey: getPublicKey(this.#secret) }
					: { unlocked: false, pubkey: null };
			case 'getPublicKey':
				return getPublicKey(this.#require());
			case 'signEvent':
				return finalizeEvent(req.payload.event, this.#require());
			case 'nip04.encrypt':
				return nip04.encrypt(this.#require(), req.payload.pubkey, req.payload.plaintext);
			case 'nip04.decrypt':
				return nip04.decrypt(this.#require(), req.payload.pubkey, req.payload.ciphertext);
			case 'nip44.encrypt': {
				const sk = this.#require();
				// nostr-tools nip44 is low-level: derive conversation key, then encrypt.
				return nip44.encrypt(
					req.payload.plaintext,
					nip44.getConversationKey(sk, req.payload.pubkey)
				);
			}
			case 'nip44.decrypt': {
				const sk = this.#require();
				return nip44.decrypt(
					req.payload.ciphertext,
					nip44.getConversationKey(sk, req.payload.pubkey)
				);
			}
			default: {
				// Exhaustiveness guard: adding an op to KeyholderOps without a case
				// here is a compile error.
				const _: never = req;
				throw new Error(`unhandled op: ${JSON.stringify(_ as object)}`);
			}
		}
	}
}
