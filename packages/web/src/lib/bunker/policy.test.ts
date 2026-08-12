/**
 * Unit tests for the pure bunker policy functions (no $state, no Worker, no
 * localStorage). These lock the permission vocabulary, the decision matrix, relay
 * normalization, and nostrconnect parsing — the logic the multi-client runtime
 * and UI will build on.
 */
import { describe, expect, it } from 'vitest';
import {
	ALWAYS,
	grant,
	check,
	prune,
	normalizeRelay,
	parseNostrConnect,
	permissionKey,
	splitKey,
	permLabel,
	describeDecision,
	type Decision
} from './policy';

describe('permission keys', () => {
	it('permissionKey builds method:param', () => {
		expect(permissionKey('sign_event', '1')).toBe('sign_event:1');
		expect(permissionKey('nip04_encrypt', 'abc123')).toBe('nip04_encrypt:abc123');
	});

	it('splitKey reverses permissionKey', () => {
		expect(splitKey('sign_event:7')).toEqual(['sign_event', '7']);
		expect(splitKey('connect')).toEqual(['connect', '']);
	});
});

describe('grant durations', () => {
	const NOW = 1_700_000_000_000;

	it('once → no persistent decision (ask next time)', () => {
		expect(grant('once', NOW)).toEqual({ acceptUntil: 0, rejectUntil: 0 });
	});
	it('5min → acceptUntil = now + 5 min', () => {
		expect(grant('5min', NOW)).toEqual({ acceptUntil: NOW + 5 * 60_000, rejectUntil: 0 });
	});
	it('1h → acceptUntil = now + 1 hour', () => {
		expect(grant('1h', NOW)).toEqual({ acceptUntil: NOW + 60 * 60_000, rejectUntil: 0 });
	});
	it('always → MAX_SAFE_INTEGER', () => {
		expect(grant('always', NOW)).toEqual({ acceptUntil: ALWAYS, rejectUntil: 0 });
	});
});

describe('check decision matrix', () => {
	const NOW = 1_700_000_000_000;
	const base = { trustApp: false, permissions: {} as Record<string, Decision> };

	it('no permission row → ask', () => {
		expect(check(base, 'sign_event:1', NOW)).toBe('ask');
	});
	it('trustApp → accept regardless of permissions', () => {
		expect(check({ trustApp: true, permissions: {} }, 'sign_event:1', NOW)).toBe('accept');
	});
	it('active accept → accept', () => {
		expect(
			check(
				{ ...base, permissions: { 'sign_event:1': { acceptUntil: NOW + 1000, rejectUntil: 0 } } },
				'sign_event:1',
				NOW
			)
		).toBe('accept');
	});
	it('expired accept → ask', () => {
		expect(
			check(
				{ ...base, permissions: { 'sign_event:1': { acceptUntil: NOW - 1000, rejectUntil: 0 } } },
				'sign_event:1',
				NOW
			)
		).toBe('ask');
	});
	it('always grant → accept (MAX > now)', () => {
		expect(
			check(
				{ ...base, permissions: { 'sign_event:1': { acceptUntil: ALWAYS, rejectUntil: 0 } } },
				'sign_event:1',
				NOW
			)
		).toBe('accept');
	});
	it('active reject → reject', () => {
		expect(
			check(
				{ ...base, permissions: { 'sign_event:4': { acceptUntil: 0, rejectUntil: NOW + 1000 } } },
				'sign_event:4',
				NOW
			)
		).toBe('reject');
	});
	it('expired reject → ask', () => {
		expect(
			check(
				{ ...base, permissions: { 'sign_event:4': { acceptUntil: 0, rejectUntil: NOW - 1000 } } },
				'sign_event:4',
				NOW
			)
		).toBe('ask');
	});
	it('both set: acceptUntil is checked first (pins precedence)', () => {
		// synthetic — v1 never sets both, but the precedence order is part of the spec
		expect(
			check(
				{ ...base, permissions: { x: { acceptUntil: NOW + 1, rejectUntil: NOW + 1 } } },
				'x',
				NOW
			)
		).toBe('accept');
	});
});

describe('prune', () => {
	const NOW = 1_700_000_000_000;

	it('drops expired, keeps active + always + active-rejects', () => {
		const perms: Record<string, Decision> = {
			gone: { acceptUntil: NOW - 1, rejectUntil: 0 },
			'keep-acc': { acceptUntil: NOW + 1000, rejectUntil: 0 },
			'keep-always': { acceptUntil: ALWAYS, rejectUntil: 0 },
			'keep-rej': { acceptUntil: 0, rejectUntil: NOW + 1000 },
			'gone-rej': { acceptUntil: 0, rejectUntil: NOW - 1 }
		};
		const out = prune(perms, NOW);
		expect(Object.keys(out).sort()).toEqual(['keep-acc', 'keep-always', 'keep-rej']);
	});
});

describe('normalizeRelay', () => {
	it('lowercases host and drops trailing slash', () => {
		expect(normalizeRelay('wss://Relay.PRIMAL.NET/')).toBe('wss://relay.primal.net');
	});
	it('keeps a non-default port and path', () => {
		expect(normalizeRelay('wss://relay.example.com:8443/path')).toBe(
			'wss://relay.example.com:8443/path'
		);
	});
	it('passes through an unparseable string', () => {
		expect(normalizeRelay('not a url')).toBe('not a url');
	});
	it('trims surrounding whitespace', () => {
		expect(normalizeRelay('  wss://relay.ditto.pub/  ')).toBe('wss://relay.ditto.pub');
	});
});

describe('parseNostrConnect', () => {
	const CLIENT = 'a'.repeat(64); // valid 32-byte hex

	it('parses client, relays, secret, and metadata', () => {
		const uri =
			`nostrconnect://${CLIENT}?relay=wss://relay.primal.net/&relay=wss://relay.ditto.pub/` +
			`&secret=y2u1pq&name=jumble.social&url=https://jumble.social&perms=sign_event:1,nip04_encrypt:abc`;
		const r = parseNostrConnect(uri);
		expect(r.client).toBe(CLIENT);
		expect(r.relays).toEqual(['wss://relay.primal.net', 'wss://relay.ditto.pub']);
		expect(r.secret).toBe('y2u1pq');
		expect(r.name).toBe('jumble.social');
		expect(r.url).toBe('https://jumble.social');
		expect(r.perms).toEqual(['sign_event:1', 'nip04_encrypt:abc']);
	});

	it('throws on missing secret', () => {
		const uri = `nostrconnect://${CLIENT}?relay=wss://relay.primal.net`;
		expect(() => parseNostrConnect(uri)).toThrow(/secret/i);
	});
	it('throws on missing relays', () => {
		const uri = `nostrconnect://${CLIENT}?secret=y2u1pq`;
		expect(() => parseNostrConnect(uri)).toThrow(/relay/i);
	});
	it('throws on a non-hex client pubkey', () => {
		const uri = `nostrconnect://notahex?relay=wss://relay.primal.net&secret=y2u1pq`;
		expect(() => parseNostrConnect(uri)).toThrow();
	});
	it('tolerates a URI with no metadata/perms', () => {
		const uri = `nostrconnect://${CLIENT}?relay=wss://relay.primal.net&secret=y2u1pq`;
		const r = parseNostrConnect(uri);
		expect(r.name).toBe('');
		expect(r.perms).toEqual([]);
	});
});

describe('permLabel', () => {
	it('labels a known event kind', () => {
		expect(permLabel('sign_event:1')).toBe('Sign note (kind 1)');
		expect(permLabel('sign_event:30023')).toBe('Sign long-form (kind 30023)');
	});
	it('labels an unknown kind numerically', () => {
		expect(permLabel('sign_event:9999')).toBe('Sign kind 9999');
	});
	it('labels nip04 with a shortened pubkey', () => {
		const pk = 'z'.repeat(64);
		expect(permLabel(`nip04_encrypt:${pk}`)).toBe(
			`NIP-04 encrypt to ${pk.slice(0, 8)}…${pk.slice(-4)}`
		);
	});
});

describe('describeDecision', () => {
	const NOW = 1_700_000_000_000;
	it('always grant → "always"', () => {
		expect(describeDecision({ acceptUntil: ALWAYS, rejectUntil: 0 }, NOW)).toBe('always');
	});
	it('time-bound accept → remaining window', () => {
		expect(describeDecision({ acceptUntil: NOW + 5 * 60_000, rejectUntil: 0 }, NOW)).toBe('for 5m');
		expect(describeDecision({ acceptUntil: NOW + 2 * 60 * 60_000, rejectUntil: 0 }, NOW)).toBe(
			'for 2h'
		);
	});
	it('expired accept → "expired"', () => {
		expect(describeDecision({ acceptUntil: NOW - 1, rejectUntil: 0 }, NOW)).toBe('expired');
	});
});
