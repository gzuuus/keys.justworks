/**
 * keys.justworks — Web Worker keyholder.
 *
 * The dispatch logic lives in `@kj/core`'s `SignerCore` (extracted so web and
 * the extension share one code path — design.md: byte-identical crypto, one
 * implementation). This module re-exports it under the web's historical
 * `Keyholder*` names so `client.ts` / `worker.ts` keep their vocabulary, plus
 * the one web-only type that belongs to the I/O adapter, not the pure signer.
 */
export type KeyholderNotification = { notification: 'auto-locked' };

export { SignerCore as KeyholderCore, IDLE_LOCK_MS } from '@kj/core';
export type {
	SignerOp as KeyholderOp,
	SignerOps as KeyholderOps,
	SignerReq as KeyholderReq,
	SignerRes as KeyholderRes
} from '@kj/core';
