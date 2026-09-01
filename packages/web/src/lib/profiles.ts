/**
 * keys.justworks — profile enrichment, pure helpers.
 *
 * Display formatting, the freshness window, and the persistence cap.
 * Deliberately free of nostr-tools imports: the root layout reaches this
 * file via `profile-chip.svelte` on every route, so anything heavy (npub
 * decode, EventStore, relays) lives in `profiles-store.ts`, loaded on demand
 * by consumers. npub display itself needs no decoding — `shortNpub` is pure
 * string work on the bech32.
 *
 * Nothing here blocks or replaces the npub: many locker keys have no profile,
 * so every consumer falls back to the npub.
 *
 * Plain module (no runes) — fully unit-testable.
 */
import type { Event } from 'nostr-tools';

/** Relays that index kind 0 (purplepag.es is purpose-built for it). */
export const METADATA_RELAYS = ['wss://purplepag.es', 'wss://nos.lol', 'wss://relay.damus.io'];

const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PROFILES = 50;

export interface Persisted {
	events: Event[]; // latest kind 0 per pubkey
	fetchedAt: Record<string, number>; // hex pubkey → epoch ms
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

/** Keep at most `max` events, evicting the stalest-fetched pubkeys. */
export function capProfiles(p: Persisted, max = MAX_PROFILES): Persisted {
	if (p.events.length <= max) return p;
	const order = Object.entries(p.fetchedAt).sort((a, b) => a[1] - b[1]);
	const drop = new Set(order.slice(0, p.events.length - max).map(([k]) => k));
	return {
		events: p.events.filter((e) => !drop.has(e.pubkey)),
		fetchedAt: Object.fromEntries(Object.entries(p.fetchedAt).filter(([k]) => !drop.has(k)))
	};
}
