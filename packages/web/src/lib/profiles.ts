/**
 * Profile enrichment (kind 0) behind npubs — EventStore + applesauce address
 * loader over a dedicated metadata relay set.
 *
 * Nothing here blocks or replaces the npub: many locker keys have no profile,
 * so every consumer falls back to the npub. Fetched events are persisted to
 * localStorage (latest kind 0 per pubkey, capped) so repeat visits paint
 * instantly with zero relay round-trips; a 7-day freshness window gates
 * refetches.
 *
 * Plain module (no runes): components subscribe via $effect; pure helpers are
 * exported for tests.
 */
import { EventStore } from 'applesauce-core';
import { kinds, nip19 } from 'nostr-tools';
import type { Event } from 'nostr-tools';
import { createAddressLoader } from 'applesauce-loaders/loaders';
import { RelayPool } from 'applesauce-relay';

/** Relays that index kind 0 (purplepag.es is purpose-built for it). */
export const METADATA_RELAYS = ['wss://purplepag.es', 'wss://nos.lol', 'wss://relay.damus.io'];

const STORE_KEY = 'kj:profiles';
const MAX_PROFILES = 50;
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;

export interface Persisted {
	events: Event[]; // latest kind 0 per pubkey
	fetchedAt: Record<string, number>; // hex pubkey → epoch ms
}

export function npubToHex(npub: string): string | null {
	try {
		const d = nip19.decode(npub);
		return d.type === 'npub' ? (d.data as string) : null;
	} catch {
		return null;
	}
}

/** `npub1abc…wxyz` — compact display for narrow surfaces. */
export function shortNpub(s: string): string {
	return s.length <= 16 ? s : `${s.slice(0, 10)}…${s.slice(-6)}`;
}

/** Deterministic fallback avatar color derived from the pubkey. */
export function hexColor(hex: string): string {
	const h = Number.parseInt(hex.slice(0, 4), 16) || 0;
	return `hsl(${h % 360} 55% 42%)`;
}

export function isFresh(ts: number | undefined, now = Date.now()): boolean {
	return ts !== undefined && now - ts < FRESH_MS;
}

/** Keep at most MAX_PROFILES events, evicting the stalest-fetched pubkeys. */
export function capProfiles(p: Persisted): Persisted {
	if (p.events.length <= MAX_PROFILES) return p;
	const order = Object.entries(p.fetchedAt).sort((a, b) => a[1] - b[1]);
	const drop = new Set(order.slice(0, p.events.length - MAX_PROFILES).map(([k]) => k));
	return {
		events: p.events.filter((e) => !drop.has(e.pubkey)),
		fetchedAt: Object.fromEntries(Object.entries(p.fetchedAt).filter(([k]) => !drop.has(k)))
	};
}

// --- module state ------------------------------------------------------------

export const eventStore = new EventStore();
const pool = new RelayPool();
const addressLoader = createAddressLoader(pool, { eventStore });

function loadPersisted(): Persisted {
	if (typeof localStorage === 'undefined') return { events: [], fetchedAt: {} };
	try {
		const raw = localStorage.getItem(STORE_KEY);
		return raw ? capProfiles(JSON.parse(raw) as Persisted) : { events: [], fetchedAt: {} };
	} catch {
		return { events: [], fetchedAt: {} };
	}
}

let persisted = loadPersisted();
// Paint instantly from the persisted events; fresh fetches only when stale.
for (const e of persisted.events) void eventStore.add(e);

function persist(): void {
	if (typeof localStorage === 'undefined') return;
	persisted = capProfiles(persisted);
	try {
		localStorage.setItem(STORE_KEY, JSON.stringify(persisted));
	} catch {
		/* quota exceeded — enrichment is best-effort, drop the write */
	}
}

/**
 * Subscribe to the kind 0 for `hex` from the metadata relays. The loader
 * verifies and inserts events into `eventStore` (models update reactively);
 * this side-channel only records freshness + persists. Returns an
 * unsubscribe handle, or null when the cached profile is still fresh (no
 * network). Unsubscribing does not abort an in-flight batch — the loader
 * deliberately keeps loading into the store.
 */
export function ensureProfile(
	hex: string
): { unsubscribe: () => void } | null {
	if (isFresh(persisted.fetchedAt[hex])) return null;
	return addressLoader({ kind: kinds.Metadata, pubkey: hex, relays: METADATA_RELAYS }).subscribe(
		(event) => {
			persisted.events = [...persisted.events.filter((e) => e.pubkey !== hex), event];
			persisted.fetchedAt[hex] = Date.now();
			persist();
		}
	);
}
