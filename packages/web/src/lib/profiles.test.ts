/**
 * Pure helpers of the profile enrichment module (npub→hex, display
 * formatting, freshness window, persistence cap).
 */
import { describe, expect, it } from 'vitest';
import { nip19 } from 'nostr-tools';
import { capProfiles, hexColor, isFresh, npubToHex, shortNpub, type Persisted } from './profiles';

const hex = 'ab'.repeat(32);
const npub = nip19.npubEncode(hex);

describe('npubToHex', () => {
	it('decodes an npub to its hex pubkey', () => {
		expect(npubToHex(npub)).toBe(hex);
	});
	it('rejects non-npub / garbage', () => {
		expect(npubToHex('nsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq')).toBeNull();
		expect(npubToHex('not-a-key')).toBeNull();
	});
});

describe('shortNpub', () => {
	it('shortens long keys and leaves short ones alone', () => {
		const short = shortNpub(npub);
		expect(short.startsWith('npub1')).toBe(true);
		expect(short).toContain('…');
		expect(short.length).toBeLessThan(20);
		expect(shortNpub('npub1abc')).toBe('npub1abc');
	});
});

describe('hexColor', () => {
	it('is deterministic and produces an hsl color', () => {
		expect(hexColor(hex)).toBe(hexColor(hex));
		expect(hexColor(hex)).toMatch(/^hsl\(\d+ 55% 42%\)$/);
	});
});

describe('isFresh', () => {
	it('honors the 7-day window', () => {
		const now = 1_000_000_000;
		expect(isFresh(now - 6 * 24 * 3600 * 1000, now)).toBe(true);
		expect(isFresh(now - 8 * 24 * 3600 * 1000, now)).toBe(false);
		expect(isFresh(undefined, now)).toBe(false);
	});
});

describe('capProfiles', () => {
	const mk = (n: number): Persisted => ({
		events: Array.from({ length: n }, (_, i) => ({
			kind: 0,
			id: `e${i}`,
			pubkey: `pk${i}`,
			created_at: i,
			tags: [],
			content: '{}',
			sig: 's'
		})) as Persisted['events'],
		fetchedAt: Object.fromEntries(Array.from({ length: n }, (_, i) => [`pk${i}`, i]))
	});

	it('keeps small maps untouched', () => {
		const p = mk(3);
		expect(capProfiles(p)).toEqual(p);
	});
	it('evicts the stalest-fetched pubkeys beyond 50', () => {
		const capped = capProfiles(mk(60));
		expect(capped.events.length).toBe(50);
		expect(capped.events.some((e) => e.pubkey === 'pk0')).toBe(false); // oldest fetchedAt
		expect(capped.events.some((e) => e.pubkey === 'pk59')).toBe(true);
		expect('pk0' in capped.fetchedAt).toBe(false);
	});
});
