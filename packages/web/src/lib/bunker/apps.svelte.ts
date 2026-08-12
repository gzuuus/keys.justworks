/**
 * keys.justworks — persisted NIP-46 bunker apps, reactive.
 *
 * One record per connected client, scoped by owner npub (so a key logout keeps
 * the apps around for the next login — the whole point of persisting). The
 * per-app `localKey` is a transport-only private key that makes the bunker URI
 * stable across reconnects (Amber's model); the runtime (bunkers.svelte.ts)
 * rebuilds each provider with `PrivateKeySigner.fromKey(app.localKey)` on load.
 *
 * Reactive glue over the pure policy functions (policy.ts): persistence and
 * owner-scoping live here; the decision logic lives there and is unit-tested.
 * `localStorage` persistence is imperative (explicit per mutation) — obvious and
 * synchronous, no `$effect.root` timing to reason about.
 */
import { browser } from '$app/environment';
import { prune, type Decision } from './policy';

const STORAGE_KEY = 'kj:bunker:apps:v1';

/** One persisted bunker app (one connected client), scoped to an owner npub. */
export interface BunkerApp {
	clientPubkey: string; // hex — the remote client's pubkey (record key)
	name: string; // from nostrconnect metadata, if any
	url: string;
	relays: string[]; // normalized
	secret: string; // connect secret
	/**
	 * Hex transport privkey — makes the bunker URI stable across reconnects.
	 * ponytail: low-stakes — relay presence only, never signs anything valuable,
	 * NOT the nsec. Page compromise is already a signing oracle, so storing it in
	 * localStorage lowers nothing (see docs/design.md threat model).
	 */
	localKey: string;
	created: number; // epoch ms
	lastUsed: number; // epoch ms
	trustApp: boolean; // per-app "fully trust" (Amber signPolicy 2)
	permissions: Record<string, Decision>;
}

type AppBucket = Record<string, BunkerApp>; // clientPubkey → app
type StoreShape = Record<string, AppBucket>; // ownerNpub → bucket

function loadAll(): StoreShape {
	if (!browser) return {};
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
	} catch {
		return {};
	}
}

/** Build a fresh app record with a new random transport key. */
export function newApp(opts: {
	clientPubkey: string;
	relays: string[];
	secret: string;
	name?: string;
	url?: string;
}): BunkerApp {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	const localKey = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
	return {
		clientPubkey: opts.clientPubkey,
		name: opts.name ?? '',
		url: opts.url ?? '',
		relays: opts.relays,
		secret: opts.secret,
		localKey,
		created: Date.now(),
		lastUsed: Date.now(),
		trustApp: false,
		permissions: {}
	};
}

class BunkerApps {
	/** Current owner npub; apps are scoped to this. Set on unlock, cleared on lock. */
	owner = $state<string | null>(null);
	#all = $state<StoreShape>(loadAll());

	/** Apps for the current owner (reactive; rebuilds when #all or owner changes). */
	get apps(): BunkerApp[] {
		return this.owner ? Object.values(this.#all[this.owner] ?? {}) : [];
	}

	/** Set the owner; prunes expired grants on load. null on lock keeps records. */
	setOwner(npub: string | null) {
		this.owner = npub;
		this.clearExpired();
	}

	get(clientPubkey: string): BunkerApp | undefined {
		if (!this.owner) return undefined;
		return this.#all[this.owner]?.[clientPubkey];
	}

	upsert(app: BunkerApp) {
		if (!this.owner) return;
		(this.#all[this.owner] ??= {})[app.clientPubkey] = app;
		this.#persist();
	}

	remove(clientPubkey: string) {
		if (!this.owner) return;
		delete this.#all[this.owner]?.[clientPubkey];
		this.#persist();
	}

	/** Record an accept-duration grant for a permission key. */
	recordDecision(clientPubkey: string, permKey: string, decision: Decision) {
		const app = this.get(clientPubkey);
		if (!app) return;
		app.permissions[permKey] = decision;
		this.#persist();
	}

	revoke(clientPubkey: string, permKey: string) {
		const app = this.get(clientPubkey);
		if (!app) return;
		delete app.permissions[permKey];
		this.#persist();
	}

	setTrust(clientPubkey: string, trustApp: boolean) {
		const app = this.get(clientPubkey);
		if (!app) return;
		app.trustApp = trustApp;
		this.#persist();
	}

	touch(clientPubkey: string) {
		const app = this.get(clientPubkey);
		if (!app) return;
		app.lastUsed = Date.now();
		this.#persist();
	}

	/** Drop expired grants across the owner's apps (inert entries; cosmetic cleanup). */
	clearExpired(now: number = Date.now()) {
		if (!this.owner) return;
		const bucket = this.#all[this.owner];
		if (!bucket) return;
		let changed = false;
		for (const app of Object.values(bucket)) {
			const fresh = prune(app.permissions, now);
			if (Object.keys(fresh).length !== Object.keys(app.permissions).length) {
				app.permissions = fresh;
				changed = true;
			}
		}
		if (changed) this.#persist();
	}

	#persist() {
		if (!browser) return;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#all));
	}
}

/** App-wide bunker-apps singleton. Persists across reloads; scoped per owner. */
export const bunkerApps = new BunkerApps();
