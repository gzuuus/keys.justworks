/**
 * keys.justworks — NIP-46 bunker policy, pure functions.
 *
 * Mirrors Amber's permission model (see references/Amber): granular per-method
 * + per-param grants stored as `acceptUntil`/`rejectUntil` epochs, a per-app
 * "fully trust" toggle (Amber's signPolicy 2), and time-bound durations. This
 * module is the single source of truth for the permission *vocabulary* and the
 * decision function; the reactive store (apps.svelte.ts) calls into it.
 *
 * Pure on purpose — no `$state`, no localStorage, no Worker — so it is fully
 * unit-testable. `check` is app-level only; the GLOBAL auto-approve toggle is an
 * orthogonal runtime policy the caller applies before calling it.
 */
import { parseNostrConnectURI } from 'applesauce-signers/helpers';

// --- durations --------------------------------------------------------------

/** Grant durations offered in the approval dialog. */
export const DURATIONS = ['once', '5min', '1h', 'always'] as const;
export type Duration = (typeof DURATIONS)[number];

const FIVE_MIN = 5 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
/** Sentinel for "always": effectively never expires. */
export const ALWAYS = Number.MAX_SAFE_INTEGER;

/** One remembered decision for a permission key. */
export interface Decision {
	acceptUntil: number;
	// ponytail: rejectUntil stays 0 until remember-reject ships; the `check`
	// branch reads it so the feature is additive (no schema change later).
	rejectUntil: number;
}

/** A decision recorded for an accept duration. A plain deny resolves the current
 *  request's promise but records nothing in v1. */
export function grant(duration: Duration, now: number = Date.now()): Decision {
	switch (duration) {
		case 'once':
			return { acceptUntil: 0, rejectUntil: 0 }; // 0 = ask again next time
		case '5min':
			return { acceptUntil: now + FIVE_MIN, rejectUntil: 0 };
		case '1h':
			return { acceptUntil: now + ONE_HOUR, rejectUntil: 0 };
		case 'always':
			return { acceptUntil: ALWAYS, rejectUntil: 0 };
	}
}

// --- permission keys --------------------------------------------------------

export type GrantableMethod =
	'sign_event' | 'nip04_encrypt' | 'nip04_decrypt' | 'nip44_encrypt' | 'nip44_decrypt';

/** `sign_event:1`, `nip04_encrypt:<pk>` — the unit a grant covers. */
export function permissionKey(method: GrantableMethod, param: string): string {
	return `${method}:${param}`;
}

/** Split a permission key back into [method, param]. */
export function splitKey(permKey: string): [string, string] {
	const i = permKey.indexOf(':');
	return i === -1 ? [permKey, ''] : [permKey.slice(0, i), permKey.slice(i + 1)];
}

// --- decision ---------------------------------------------------------------

export type Verdict = 'accept' | 'reject' | 'ask';

/**
 * Decide whether a permission is auto-granted for this app. App-level only —
 * the global auto-approve toggle is applied by the caller. `now` is injectable
 * for tests. Distilled from Amber's `IntentUtils.isRemembered`.
 */
export function check(
	app: { trustApp: boolean; permissions: Record<string, Decision> },
	permKey: string,
	now: number = Date.now()
): Verdict {
	if (app.trustApp) return 'accept';
	const d = app.permissions[permKey];
	if (!d) return 'ask';
	if (d.acceptUntil > now) return 'accept';
	if (d.rejectUntil > now) return 'reject';
	return 'ask';
}

/** Drop entries where both until fields have expired (`always` survives: MAX > now). */
export function prune(
	permissions: Record<string, Decision>,
	now: number = Date.now()
): Record<string, Decision> {
	const out: Record<string, Decision> = {};
	for (const [k, d] of Object.entries(permissions)) {
		if (d.acceptUntil > now || d.rejectUntil > now) out[k] = d;
	}
	return out;
}

// --- relay normalization ----------------------------------------------------

/** Lowercase host, drop trailing slash, keep port/path. Dedups equivalent URLs. */
export function normalizeRelay(url: string): string {
	try {
		const u = new URL(url.trim());
		let s = `${u.protocol}//${u.hostname.toLowerCase()}`;
		if (u.port) s += `:${u.port}`;
		if (u.pathname && u.pathname !== '/') s += u.pathname.replace(/\/+$/, '');
		return s;
	} catch {
		return url.trim(); // unparseable: leave as-is, caller may reject
	}
}

// --- nostrconnect parsing ---------------------------------------------------

export interface ParsedNostrConnect {
	client: string; // hex pubkey of the remote client
	relays: string[]; // normalized
	secret: string;
	name: string; // from URI metadata, if provided
	url: string;
}

/**
 * Parse a nostrconnect:// URI, reusing applesauce's validator (correct host vs
 * pathname pubkey extraction, secret/relay presence) and augmenting with the
 * client metadata Amber captures for display.
 */
export function parseNostrConnect(uri: string): ParsedNostrConnect {
	const base = parseNostrConnectURI(uri); // throws on invalid client/secret/relays
	const p = new URL(uri).searchParams;
	return {
		client: base.client,
		relays: base.relays.map(normalizeRelay),
		secret: base.secret ?? '',
		name: p.get('name') ?? '',
		url: p.get('url') ?? ''
	};
}

// --- display ----------------------------------------------------------------

const KIND_LABELS: Record<number, string> = {
	0: 'metadata',
	1: 'note',
	3: 'contacts',
	4: 'direct message',
	5: 'deletion',
	6: 'repost',
	7: 'reaction',
	9734: 'zap request',
	9735: 'zap receipt',
	10000: 'mute list',
	10002: 'relay list',
	22242: 'relay auth',
	30023: 'long-form'
};

export function short(pk: string): string {
	return pk.length > 16 ? `${pk.slice(0, 8)}…${pk.slice(-4)}` : pk;
}

/** Human-readable label for a permission key (logs, dialogs, grant panels). */
export function permLabel(permKey: string): string {
	const [method, param] = splitKey(permKey);
	switch (method) {
		case 'sign_event': {
			const kind = Number(param);
			const name = KIND_LABELS[kind];
			return name ? `Sign ${name} (kind ${kind})` : `Sign kind ${kind}`;
		}
		case 'nip04_encrypt':
			return `NIP-04 encrypt to ${short(param)}`;
		case 'nip04_decrypt':
			return `NIP-04 decrypt from ${short(param)}`;
		case 'nip44_encrypt':
			return `NIP-44 encrypt to ${short(param)}`;
		case 'nip44_decrypt':
			return `NIP-44 decrypt from ${short(param)}`;
		default:
			return permKey;
	}
}

// --- grant status (display) -----------------------------------------------

/** Human-readable label for a remembered decision (for grant panels). */
export function describeDecision(d: Decision, now: number = Date.now()): string {
	if (d.acceptUntil >= ALWAYS) return 'always';
	if (d.acceptUntil > now) return `for ${formatRemaining(d.acceptUntil - now)}`;
	// ponytail: reject branches stay until remember-reject ships; v1 never sets rejectUntil.
	if (d.rejectUntil >= ALWAYS) return 'always denied';
	if (d.rejectUntil > now) return `denied for ${formatRemaining(d.rejectUntil - now)}`;
	return 'expired';
}

function formatRemaining(ms: number): string {
	if (ms >= 60 * 60 * 1000) return `${Math.round(ms / (60 * 60 * 1000))}h`;
	if (ms >= 60 * 1000) return `${Math.round(ms / (60 * 1000))}m`;
	return `${Math.round(ms / 1000)}s`;
}
