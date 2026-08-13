/**
 * keys.justworks — offline account cache (Tier A), reactive.
 *
 * Caches the ncryptsec of every account successfully unlocked on this device,
 * keyed by `H(identifier)`, so a returning user can unlock without a server
 * round-trip — and fully offline. **Never stores the plaintext identifier**,
 * only its one-way hash (already known to the server), so the keystone property
 * holds: an attacker who reads localStorage still needs `identifier ‖ password`
 * to decrypt. A cached entry is just a duplicate of what the server already
 * holds (encrypted blob + public npub + a hash already on the server) — no new
 * secret reaches the device.
 *
 * `npub` is stored as the display identity (public) and as a tamper/stale check:
 * after decrypting a cached blob the caller asserts the result matches, so a
 * swapped or stale blob is detected. Erase must purge an entry; a password
 * change must refresh its blob (or it goes stale and the npub check trips).
 *
 * Mirrors bunkerApps' imperative-persistence pattern (explicit per mutation,
 * synchronous, no `$effect.root` timing to reason about).
 */
import { browser } from '$app/environment';

const STORAGE_KEY = 'kj:accounts:v1';

export interface CachedAccount {
	ncryptsec: string;
	npub: string;
	label: string; // display name; defaults to a shortened npub until kind-0 enrichment
	updatedAt: number; // epoch ms; drives recency ordering on the unlock screen
}

type StoreShape = Record<string, CachedAccount>; // identifierHash → account

function loadAll(): StoreShape {
	if (!browser) return {};
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
	} catch {
		return {};
	}
}

/** Shorten an npub (or any long string) for display: `npub1abc…wxyz`. */
function shortNpub(s: string): string {
	return s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s;
}

class Accounts {
	#all = $state<StoreShape>(loadAll());

	/** Reactive list of cached accounts (for the unlock-screen cards), newest first. */
	get list(): { id: string; account: CachedAccount }[] {
		return Object.entries(this.#all)
			.sort((a, b) => b[1].updatedAt - a[1].updatedAt)
			.map(([id, account]) => ({ id, account }));
	}

	lookup(identifierHash: string): CachedAccount | undefined {
		return this.#all[identifierHash];
	}

	/** Upsert after a successful unlock. Preserves an existing label (e.g. a
	 *  user-chosen name) when refreshing a stale blob on password change. */
	save(identifierHash: string, ncryptsec: string, npub: string) {
		const prev = this.#all[identifierHash];
		this.#all[identifierHash] = {
			ncryptsec,
			npub,
			label: prev?.label ?? shortNpub(npub),
			updatedAt: Date.now()
		};
		this.#persist();
	}

	/** Bump `updatedAt` on a cache-hit unlock (recency ordering). */
	touch(identifierHash: string) {
		const acct = this.#all[identifierHash];
		if (!acct) return;
		acct.updatedAt = Date.now();
		this.#persist();
	}

	remove(identifierHash: string) {
		delete this.#all[identifierHash];
		this.#persist();
	}

	/** Wipe every cached account (full erase / "forget this device"). */
	clear() {
		this.#all = {};
		this.#persist();
	}

	#persist() {
		if (!browser) return;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#all));
	}
}

/** Device-wide account cache singleton. Persists across reloads. */
export const accounts = new Accounts();
