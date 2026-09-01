/**
 * keys.justworks — profile enrichment store (kind 0).
 *
 * EventStore + applesauce address loader over a dedicated metadata relay set.
 * Split from `profiles.ts` (the pure helpers) because this module pulls the
 * whole applesauce/nostr-tools stack — consumers `import()` it on demand so
 * the marketing pages never pay for it.
 *
 * Fetched events are persisted to localStorage (latest kind 0 per pubkey,
 * capped) so repeat visits paint instantly with zero relay round-trips; a
 * 7-day freshness window gates refetches.
 *
 * Plain module (no runes): components subscribe via callbacks; pure helpers
 * stay in `profiles.ts`.
 */
import { EventStore } from 'applesauce-core';
import { ProfileModel } from 'applesauce-core/models';
import { kinds, nip19 } from 'nostr-tools';
import { createAddressLoader } from 'applesauce-loaders/loaders';
import { RelayPool } from 'applesauce-relay';
import { capProfiles, isFresh, METADATA_RELAYS, type Persisted } from './profiles';

export function npubToHex(npub: string): string | null {
	try {
		const d = nip19.decode(npub);
		return d.type === 'npub' ? (d.data as string) : null;
	} catch {
		return null;
	}
}

const STORE_KEY = 'kj:profiles';

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

/** The slice of a kind 0 the UI cares about (see ProfileModel). */
export interface Kind0Profile {
	name?: string;
	display_name?: string;
	picture?: string;
	nip05?: string;
}

/**
 * Subscribe to the kind 0 for `hex` from the metadata relays. The loader
 * verifies and inserts events into `eventStore` (models update reactively);
 * this side-channel only records freshness + persists. Returns an
 * unsubscribe handle, or null when the cached profile is still fresh (no
 * network). Unsubscribing does not abort an in-flight batch — the loader
 * deliberately keeps loading into the store.
 */
export function ensureProfile(hex: string): { unsubscribe: () => void } | null {
	if (isFresh(persisted.fetchedAt[hex])) return null;
	return addressLoader({ kind: kinds.Metadata, pubkey: hex, relays: METADATA_RELAYS }).subscribe(
		(event) => {
			persisted.events = [...persisted.events.filter((e) => e.pubkey !== hex), event];
			persisted.fetchedAt[hex] = Date.now();
			persist();
		}
	);
}

/** Observe the kind 0 for `hex` and fetch it when stale. Returns an unsubscriber. */
export function subscribeProfile(
	hex: string,
	onUpdate: (profile: Kind0Profile | null) => void
): () => void {
	const sub = eventStore.model(ProfileModel, hex).subscribe((p) => onUpdate(p ?? null));
	const fetchSub = ensureProfile(hex);
	return () => {
		sub.unsubscribe();
		fetchSub?.unsubscribe();
	};
}
