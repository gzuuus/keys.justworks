/**
 * Unit tests for the keyholder dispatch logic (no Worker: the pure `KeyholderCore`).
 *
 * Exercises the NIP-07-shaped operations end-to-end against a real recorded
 * ncryptsec, plus lock/unlock state, the nip04/nip44 round-trips, and the
 * CPU-bound offload ops (`passwordSecret`, `create`). Verifying the actual Worker
 * `postMessage` plumbing is left to manual browser testing.
 */
import { describe, expect, it } from 'vitest';
import { generateSecretKey, getPublicKey, nip19, verifyEvent, type Event } from 'nostr-tools';
import { encryptSecret, decryptSecret } from '@kj/core';
import { KeyholderCore, IDLE_LOCK_MS, type KeyholderReq } from './core';

const ID = 'alice@example.com';
const PW = 'correct horse battery staple';
const SECRET = generateSecretKey();
const NCRYPTSEC = encryptSecret(SECRET, ID, PW);
const PUBKEY = getPublicKey(SECRET);
const N_PUB = nip19.npubEncode(PUBKEY);
// Pinned golden auth secret for (ID, PW) — locks the scrypt contract.
const PW_SECRET = 'bf4bf9a5ecfec3f96390af8783cf5b68caea179bf505719236c35660e85ee98c';

let n = 0;
/** Build a wire message for `op`; payload defaults to undefined (void ops). */
function msg(op: string, payload: unknown = undefined): KeyholderReq {
	return { id: `r${n++}`, op, payload } as KeyholderReq;
}
async function ok(core: KeyholderCore, m: KeyholderReq): Promise<unknown> {
	const res = await core.handle(m);
	if (!res.ok) throw new Error(`unexpected error: ${(res as { error: string }).error}`);
	return (res as { result: unknown }).result;
}
async function err(core: KeyholderCore, m: KeyholderReq): Promise<string> {
	const res = await core.handle(m);
	if (res.ok) throw new Error('expected error, got ok');
	return (res as { error: string }).error;
}

describe('KeyholderCore lifecycle', () => {
	it('starts locked and refuses signing', async () => {
		const core = new KeyholderCore();
		expect(core.unlocked).toBe(false);
		expect(await err(core, msg('getPublicKey'))).toMatch(/locked/);
	});

	it('unlock → getPublicKey → lock', async () => {
		const core = new KeyholderCore();
		expect(
			await ok(core, msg('unlock', { ncryptsec: NCRYPTSEC, identifier: ID, password: PW }))
		).toEqual({
			npub: N_PUB
		});
		expect(core.unlocked).toBe(true);
		expect(await ok(core, msg('getPublicKey'))).toBe(PUBKEY);
		expect(await ok(core, msg('lock'))).toEqual({ locked: true });
		expect(core.unlocked).toBe(false);
		expect(await err(core, msg('getPublicKey'))).toMatch(/locked/);
	});

	it('status reports pubkey when unlocked', async () => {
		const core = new KeyholderCore();
		expect(await ok(core, msg('status'))).toEqual({ unlocked: false, pubkey: null });
		await ok(core, msg('unlock', { ncryptsec: NCRYPTSEC, identifier: ID, password: PW }));
		expect(await ok(core, msg('status'))).toEqual({ unlocked: true, pubkey: PUBKEY });
	});

	it('unlock with a wrong password fails and stays locked', async () => {
		const core = new KeyholderCore();
		await expect(
			ok(core, msg('unlock', { ncryptsec: NCRYPTSEC, identifier: ID, password: 'wrong' }))
		).rejects.toThrow();
		expect(core.unlocked).toBe(false);
	});

	it('import decodes an nsec and wraps it to a valid ncryptsec, without holding', async () => {
		const core = new KeyholderCore();
		const nsec = nip19.nsecEncode(SECRET);
		const res = (await ok(core, msg('import', { nsec, identifier: ID, password: PW }))) as {
			ncryptsec: string;
			npub: string;
			passwordSecret: string;
		};
		expect(res.npub).toBe(N_PUB);
		expect(res.passwordSecret).toBe(PW_SECRET); // golden auth secret, like `create`
		// ncryptsec is non-deterministic (random salt/nonce); verify by decrypting.
		expect(getPublicKey(decryptSecret(res.ncryptsec, ID, PW))).toBe(PUBKEY);
		// import is a one-shot transform — it must NOT leave a key held.
		expect(core.unlocked).toBe(false);
		expect(await err(core, msg('getPublicKey'))).toMatch(/locked/);
	});

	it('import rejects a malformed nsec', async () => {
		const core = new KeyholderCore();
		await expect(
			ok(core, msg('import', { nsec: 'not-an-nsec', identifier: ID, password: PW }))
		).rejects.toThrow();
	});

	it('lock() wipes a held key directly (the path idle auto-lock takes)', async () => {
		const core = new KeyholderCore();
		await ok(core, msg('unlock', { ncryptsec: NCRYPTSEC, identifier: ID, password: PW }));
		expect(core.unlocked).toBe(true);
		core.lock();
		expect(core.unlocked).toBe(false);
		expect(await err(core, msg('getPublicKey'))).toMatch(/locked/);
	});

	it('reencrypt re-wraps the held key under a new passphrase (password change)', async () => {
		const core = new KeyholderCore();
		await ok(core, msg('unlock', { ncryptsec: NCRYPTSEC, identifier: ID, password: PW }));
		const NEW_PW = 'new password 123';
		const res = (await ok(core, msg('reencrypt', { identifier: ID, newPassword: NEW_PW }))) as {
			ncryptsec: string;
		};
		// New blob decrypts under the NEW password to the same key.
		expect(getPublicKey(decryptSecret(res.ncryptsec, ID, NEW_PW))).toBe(PUBKEY);
		// The held key is unchanged — still signs as the same identity.
		expect(await ok(core, msg('getPublicKey'))).toBe(PUBKEY);
	});

	it('reencrypt refuses while locked', async () => {
		const core = new KeyholderCore();
		expect(await err(core, msg('reencrypt', { identifier: ID, newPassword: 'x' }))).toMatch(
			/locked/
		);
	});

	it('IDLE_LOCK_MS is the generous ~30 min idle window', () => {
		expect(IDLE_LOCK_MS).toBe(30 * 60 * 1000);
	});
});

describe('KeyholderCore CPU offload', () => {
	it('passwordSecret returns the golden auth secret, statelessly', async () => {
		const core = new KeyholderCore();
		const secret = (await ok(
			core,
			msg('passwordSecret', { identifier: ID, password: PW })
		)) as string;
		expect(secret).toBe(PW_SECRET);
		expect(core.unlocked).toBe(false); // never touches the held key
	});

	it('create generates + wraps a fresh key and stays stateless', async () => {
		const core = new KeyholderCore();
		const res = (await ok(core, msg('create', { identifier: ID, password: PW }))) as {
			ncryptsec: string;
			npub: string;
			nsec: string;
			passwordSecret: string;
		};
		// ncryptsec decrypts under the keystone to the key whose npub was returned.
		const key = decryptSecret(res.ncryptsec, ID, PW);
		expect(nip19.npubEncode(getPublicKey(key))).toBe(res.npub);
		// the nsec backup decodes to that same key.
		const dec = nip19.decode(res.nsec);
		expect(dec.type).toBe('nsec');
		expect(nip19.npubEncode(getPublicKey(dec.data as Uint8Array))).toBe(res.npub);
		// auth secret matches the golden vector (locks cross-surface drift).
		expect(res.passwordSecret).toBe(PW_SECRET);
		// create never holds a key.
		expect(core.unlocked).toBe(false);
	});
});

describe('KeyholderCore NIP-07 signing', () => {
	it('signEvent adds id, pubkey, sig and verifies', async () => {
		const core = new KeyholderCore();
		await ok(core, msg('unlock', { ncryptsec: NCRYPTSEC, identifier: ID, password: PW }));
		const event = (await ok(
			core,
			msg('signEvent', {
				event: { kind: 1, content: 'hello from the worker', tags: [], created_at: 1_700_000_0000 }
			})
		)) as Event;
		expect(event.pubkey).toBe(PUBKEY);
		expect(event.id).toHaveLength(64);
		expect(event.sig).toHaveLength(128);
		expect(verifyEvent(event)).toBe(true);
	});

	it('getPublicKey matches the npub registered for this key', async () => {
		const core = new KeyholderCore();
		await ok(core, msg('unlock', { ncryptsec: NCRYPTSEC, identifier: ID, password: PW }));
		expect(nip19.npubEncode((await ok(core, msg('getPublicKey'))) as string)).toBe(N_PUB);
	});

	it('exportNsec returns the held key as an nsec, and refuses while locked', async () => {
		const core = new KeyholderCore();
		expect(await err(core, msg('exportNsec'))).toMatch(/locked/);
		await ok(core, msg('unlock', { ncryptsec: NCRYPTSEC, identifier: ID, password: PW }));
		const res = (await ok(core, msg('exportNsec'))) as { nsec: string };
		const dec = nip19.decode(res.nsec);
		expect(dec.type).toBe('nsec');
		// The exported nsec is the SAME key (round-trips to the registered pubkey).
		expect(getPublicKey(dec.data as Uint8Array)).toBe(PUBKEY);
		// Export is read-only — the key stays held.
		expect(core.unlocked).toBe(true);
	});
});

describe('KeyholderCore nip04 / nip44', () => {
	it('nip04 encrypt → decrypt round-trips (to self)', async () => {
		const core = new KeyholderCore();
		await ok(core, msg('unlock', { ncryptsec: NCRYPTSEC, identifier: ID, password: PW }));
		const enc = (await ok(
			core,
			msg('nip04.encrypt', { pubkey: PUBKEY, plaintext: 'secret msg' })
		)) as string;
		const dec = (await ok(
			core,
			msg('nip04.decrypt', { pubkey: PUBKEY, ciphertext: enc })
		)) as string;
		expect(dec).toBe('secret msg');
	});

	it('nip44 encrypt → decrypt round-trips (to self)', async () => {
		const core = new KeyholderCore();
		await ok(core, msg('unlock', { ncryptsec: NCRYPTSEC, identifier: ID, password: PW }));
		const enc = (await ok(
			core,
			msg('nip44.encrypt', { pubkey: PUBKEY, plaintext: 'nip44 payload 🚀' })
		)) as string;
		const dec = (await ok(
			core,
			msg('nip44.decrypt', { pubkey: PUBKEY, ciphertext: enc })
		)) as string;
		expect(dec).toBe('nip44 payload 🚀');
	});
});
