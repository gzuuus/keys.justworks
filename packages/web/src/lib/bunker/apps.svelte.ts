/**
 * keys.justworks — persisted NIP-46 bunker apps, reactive.
 *
 * One record per bunker slot (transport identity + relay set + secret), scoped by
 * owner npub so a key logout keeps the apps around for the next login. Records
 * are keyed by a generated `id` (stable, opaque) — NOT the client pubkey, because
 * a bunker:// slot has no client until one connects. The per-app `localKey` is a
 * transport-only private key that makes the bunker URI stable across reconnects
 * (Amber's model); the runtime (bunkers.svelte.ts) rebuilds each provider with
 * `PrivateKeySigner.fromKey(app.localKey)` on start.
 *
 * Reactive glue over the pure policy functions (policy.ts): persistence and
 * owner-scoping live here; decision logic lives there and is unit-tested.
 * `localStorage` persistence is imperative (explicit per mutation) — obvious and
 * synchronous, no `$effect.root` timing to reason about.
 */
import { browser } from '$app/environment';
import { prune, short, type Decision } from './policy';

const STORAGE_KEY = 'kj:bunker:apps:v1';

export type BunkerMode = 'bunker' | 'nostrconnect';

/** One persisted bunker slot, scoped to an owner npub. */
export interface BunkerApp {
	id: string; // record key (opaque, stable)
	mode: BunkerMode; // how the slot was created
	localKey: string; // hex transport privkey → stable bunker URI
	clientPubkey: string | null; // learned on connect (nostrconnect: known at creation)
	name: string; // client display name (from nostrconnect metadata or connect)
	url: string;
	relays: string[]; // normalized
	secret: string; // connect secret
	created: number; // epoch ms
	lastUsed: number; // epoch ms
	trustApp: boolean; // per-app "fully trust" (Amber signPolicy 2)
	permissions: Record<string, Decision>;
}

type AppBucket = Record<string, BunkerApp>; // id → app
type StoreShape = Record<string, AppBucket>; // ownerNpub → bucket

function loadAll(): StoreShape {
	if (!browser) return {};
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
	} catch {
		return {};
	}
}

/** Human label for a slot: its name, else the short client key, else a fallback. */
export function displayName(app: BunkerApp): string {
	return app.name || (app.clientPubkey ? short(app.clientPubkey) : 'Bunker slot');
}

/** Build a fresh slot record with a new random transport key. */
export function newApp(opts: {
	mode: BunkerMode;
	relays: string[];
	secret: string;
	clientPubkey?: string | null;
	name?: string;
	url?: string;
}): BunkerApp {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	const localKey = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
	return {
		id: crypto.randomUUID(),
		mode: opts.mode,
		localKey,
		clientPubkey: opts.clientPubkey ?? null,
		name: opts.name ?? '',
		url: opts.url ?? '',
		relays: opts.relays,
		secret: opts.secret,
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

	get(id: string): BunkerApp | undefined {
		if (!this.owner) return undefined;
		return this.#all[this.owner]?.[id];
	}

	/** Find a slot by its connected client pubkey (nostrconnect dedup). */
	findByClient(clientPubkey: string): BunkerApp | undefined {
		return this.apps.find((a) => a.clientPubkey === clientPubkey);
	}

	upsert(app: BunkerApp) {
		if (!this.owner) return;
		(this.#all[this.owner] ??= {})[app.id] = app;
		this.#persist();
	}

	remove(id: string) {
		if (!this.owner) return;
		delete this.#all[this.owner]?.[id];
		this.#persist();
	}

	/** Record an accept-duration grant for a permission key. */
	recordDecision(id: string, permKey: string, decision: Decision) {
		const app = this.get(id);
		if (!app) return;
		app.permissions[permKey] = decision;
		this.#persist();
	}

	revoke(id: string, permKey: string) {
		const app = this.get(id);
		if (!app) return;
		delete app.permissions[permKey];
		this.#persist();
	}

	setTrust(id: string, trustApp: boolean) {
		const app = this.get(id);
		if (!app) return;
		app.trustApp = trustApp;
		this.#persist();
	}

	/** Rename a slot (bunker:// slots have no client metadata to derive a name from). */
	rename(id: string, name: string) {
		const app = this.get(id);
		if (!app) return;
		app.name = name.trim();
		this.#persist();
	}

	/** Record the client that connected. (Metadata like name/url come from the
	 *  nostrconnect URI at creation; applesauce surfaces only pubkey + perms on
	 *  connect, so there's nothing extra to learn here.) */
	setClient(id: string, clientPubkey: string) {
		const app = this.get(id);
		if (!app) return;
		app.clientPubkey = clientPubkey;
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
