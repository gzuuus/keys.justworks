/**
 * keys.justworks — multi-client NIP-46 bunker runtime.
 *
 * N NostrConnectProvider instances over ONE shared RelayPool, each with a stable
 * transport identity (`PrivateKeySigner.fromKey(app.localKey)`) so a bunker://
 * slot's URI is identical across reconnects and a nostrconnect:// client keeps
 * talking to the same transport pubkey after a reload. The pool dedupes relay
 * connections; each provider owns its own subscription via the pool (no manual
 * routing — the part of Amber's design that applesauce makes unnecessary).
 *
 * Approval is runtime-owned (the gate to signing): a reactive queue + dialog
 * flag the page renders. Decisions flow through `policy.check()`, so remembered
 * grants auto-resolve; `autoApprove` and per-app `trustApp` short-circuit. The
 * dialog offers once / 5min / 1h / always durations; anything beyond 'once' is
 * persisted via `recordDecision`.
 *
 * App-scoped singleton: the root layout starts/stops it from the keyholder
 * lifecycle (startAll on unlock, stopAll on lock), so a connected client can
 * sign from any page. The approval dialog is rendered globally by the layout.
 * Persisted records (apps.svelte.ts) survive across reloads.
 */
import { RelayPool } from 'applesauce-relay';
import { NostrConnectProvider, PrivateKeySigner } from 'applesauce-signers';
import { keyholder } from '$lib/keyholder/store.svelte';
import { bunkerApps, newApp, type BunkerApp } from './apps.svelte';
import {
	check,
	grant,
	normalizeRelay,
	parseNostrConnect,
	permLabel,
	permissionKey,
	short,
	type Duration
} from './policy';

export type Status = 'stopped' | 'listening' | 'connected';

export interface Slot {
	status: Status;
	bunkerUri: string | null;
	error: string | null;
}

export type LogKind = 'info' | 'connect' | 'disconnect' | 'request' | 'grant' | 'error';
const LOG_VARIANT: Record<LogKind, 'default' | 'secondary' | 'destructive' | 'outline'> = {
	info: 'secondary',
	connect: 'default',
	disconnect: 'outline',
	request: 'default',
	grant: 'default',
	error: 'destructive'
};
export interface LogEntry {
	id: number;
	ts: Date;
	kind: LogKind;
	appId: string;
	msg: string;
}

export type ApprovalKind =
	'connect' | 'sign_event' | 'nip04_encrypt' | 'nip04_decrypt' | 'nip44_encrypt' | 'nip44_decrypt';
const APPROVAL_LABEL: Record<ApprovalKind, string> = {
	connect: 'Connect',
	sign_event: 'Sign event',
	nip04_encrypt: 'NIP-04 encrypt',
	nip04_decrypt: 'NIP-04 decrypt',
	nip44_encrypt: 'NIP-44 encrypt',
	nip44_decrypt: 'NIP-44 decrypt'
};
export interface ApprovalRequest {
	id: number;
	appId: string;
	kind: ApprovalKind;
	client: string;
	summary: string;
	detail?: string;
	permKey: string; // 'connect' has no grantable row; check() → 'ask'
	resolve: (allow: boolean) => void;
}

function errMsg(e: unknown): string {
	return e instanceof Error ? e.message : 'unknown error';
}

export class BunkerRuntime {
	#pool = new RelayPool();
	#providers = new Map<string, NostrConnectProvider>();

	/** Comma-separated default relays for new bunker:// slots. */
	sharedRelays = $state('wss://relay.primal.net, wss://relay.ditto.pub');
	/** Global auto-approve (all apps). Off = each unresolved request opens a dialog. */
	autoApprove = $state(false);

	/** Live per-app transport state, keyed by app id. */
	slots = $state<Record<string, Slot>>({});
	logs = $state<LogEntry[]>([]);
	/** Approval queue + dialog flag (page renders the dialog from these). */
	pending = $state<ApprovalRequest[]>([]);
	dialogOpen = $state(false);

	#logSeq = 0;
	#approvalSeq = 0;

	get logVariant() {
		return LOG_VARIANT;
	}

	// --- create --------------------------------------------------------------

	/** Provider-initiated: start a fresh bunker:// slot and return its URI. */
	async createBunker(name: string): Promise<void> {
		const relays = this.#parsedRelays();
		if (!relays.length) throw new Error('add at least one relay');
		const app = newApp({ mode: 'bunker', relays, secret: crypto.randomUUID(), name: name.trim() });
		bunkerApps.upsert(app);
		await this.#startAndSlot(app);
	}

	/** Client-initiated: adopt a nostrconnect:// URI (parses + dedups by client). */
	async createNostrconnect(uriRaw: string): Promise<void> {
		const parsed = parseNostrConnect(uriRaw.trim()); // throws on invalid
		const existing = bunkerApps.findByClient(parsed.client);
		const app =
			existing ??
			newApp({
				mode: 'nostrconnect',
				relays: parsed.relays,
				secret: parsed.secret,
				clientPubkey: parsed.client,
				name: parsed.name,
				url: parsed.url
			});
		if (existing) {
			// a known client reconnected with a fresh URI — refresh its fields
			app.relays = parsed.relays;
			app.secret = parsed.secret;
			if (parsed.name) app.name = parsed.name;
			if (parsed.url) app.url = parsed.url;
		}
		bunkerApps.upsert(app);
		await this.#startAndSlot(app, uriRaw.trim());
	}

	/** Start (or reconnect) a provider for an app and track its slot state. */
	async #startAndSlot(app: BunkerApp, uri?: string): Promise<void> {
		try {
			const bunkerUri = await this.#start(app, uri);
			this.slots[app.id] = { status: 'listening', bunkerUri, error: null };
			this.#log(
				'info',
				app.id,
				uri
					? `connecting to ${app.name || short(app.clientPubkey ?? 'client')} via nostrconnect`
					: `bunker listening on ${app.relays.join(', ')}`
			);
		} catch (e) {
			this.slots[app.id] = { status: 'stopped', bunkerUri: null, error: errMsg(e) };
			this.#log('error', app.id, errMsg(e));
		}
	}

	async #start(app: BunkerApp, uri?: string): Promise<string | null> {
		// Ignore relay replay of events from before this provider started. On
		// reconnect the relay otherwise dumps every stored kind-24133 for the
		// (now-persistent) transport pubkey, re-firing callbacks for requests
		// already handled. Mirrors Amber's `since` filter.
		const since = Math.floor(Date.now() / 1000);
		const provider = new NostrConnectProvider({
			relays: app.relays,
			signer: PrivateKeySigner.fromKey(app.localKey),
			bunkerSecret: app.secret,
			upstream: keyholder,
			pool: {
				subscription: (relays, filters) =>
					this.#pool.subscription.call(
						this.#pool,
						relays,
						filters.map((f) => ({ ...f, since }))
					),
				publish: this.#pool.publish.bind(this.#pool)
			},
			onClientConnect: (client) => {
				bunkerApps.setClient(app.id, client);
				this.#setStatus(app.id, 'connected');
				this.#log('connect', app.id, `client connected: ${short(client)}`);
			},
			onClientDisconnect: () => {
				this.#setStatus(app.id, 'listening');
				this.#log('disconnect', app.id, 'client disconnected');
			},
			onConnect: (client, perms) =>
				this.#decide(
					app.id,
					'connect',
					'connect',
					client,
					`connect${perms?.length ? ` · ${perms.join(', ')}` : ''}`
				),
			onSignEvent: (draft, client) =>
				this.#decide(
					app.id,
					'sign_event',
					permissionKey('sign_event', String(draft.kind)),
					client,
					`kind ${draft.kind}`,
					draft
				),
			onNip04Encrypt: (pk, plaintext, client) =>
				this.#decide(
					app.id,
					'nip04_encrypt',
					permissionKey('nip04_encrypt', pk),
					client,
					`to ${short(pk)} · ${plaintext.length} chars`
				),
			onNip04Decrypt: (pk, _ct, client) =>
				this.#decide(
					app.id,
					'nip04_decrypt',
					permissionKey('nip04_decrypt', pk),
					client,
					`from ${short(pk)}`
				),
			onNip44Encrypt: (pk, plaintext, client) =>
				this.#decide(
					app.id,
					'nip44_encrypt',
					permissionKey('nip44_encrypt', pk),
					client,
					`to ${short(pk)} · ${plaintext.length} chars`
				),
			onNip44Decrypt: (pk, _ct, client) =>
				this.#decide(
					app.id,
					'nip44_decrypt',
					permissionKey('nip44_decrypt', pk),
					client,
					`from ${short(pk)}`
				),
			onLogout: () => this.#log('disconnect', app.id, 'client logged out (session ended)')
		});
		this.#providers.set(app.id, provider);
		// Reconnect only (no fresh URI): restore the known client so the provider
		// accepts its requests without a new connect handshake — the client won't
		// re-send connect on its own, so without this every request would be
		// rejected as "unknown client" and hang until timeout.
		if (!uri && app.clientPubkey) provider.client = app.clientPubkey;
		await provider.start(uri);
		return app.mode === 'bunker' ? await provider.getBunkerURI() : null;
	}

	// --- lifecycle ----------------------------------------------------------

	/** Reconnect all persisted apps (called by the page on mount when unlocked). */
	async startAll(): Promise<void> {
		for (const app of bunkerApps.apps) {
			if (!this.#providers.has(app.id)) await this.#startAndSlot(app);
		}
	}

	async stop(id: string): Promise<void> {
		const provider = this.#providers.get(id);
		if (!provider) return;
		try {
			await provider.stop();
		} catch (e) {
			this.#log('error', id, errMsg(e));
		}
		this.#providers.delete(id);
		this.#setStatus(id, 'stopped');
		this.#log('info', id, 'stopped');
	}

	async remove(id: string): Promise<void> {
		this.#clearPendingFor(id);
		await this.stop(id);
		bunkerApps.remove(id);
		delete this.slots[id];
	}

	/** Stop every provider + deny all pending (called on unmount/lock). */
	async stopAll(): Promise<void> {
		this.clearPending();
		await Promise.all([...this.#providers.keys()].map((id) => this.stop(id)));
	}

	async restart(id: string): Promise<void> {
		const app = bunkerApps.get(id);
		if (!app) return;
		await this.stop(id);
		await this.#startAndSlot(app);
	}

	// --- approval (runtime-owned; page renders) ------------------------------

	/**
	 * Resolve the front of the queue. `allow` grants the request; when `duration`
	 * is longer than 'once' (and the request isn't the connect handshake), the
	 * grant is persisted so future matching requests auto-approve via `check`.
	 */
	decide(allow: boolean, duration: Duration = 'once') {
		const [req, ...rest] = this.pending;
		if (!req) return;
		this.pending = rest;
		if (allow && duration !== 'once' && req.permKey !== 'connect') {
			bunkerApps.recordDecision(req.appId, req.permKey, grant(duration));
		}
		this.#log(
			allow ? 'grant' : 'request',
			req.appId,
			`${allow ? 'approved' : 'denied'}${duration !== 'once' ? ` (${duration})` : ''}: ${APPROVAL_LABEL[
				req.kind
			].toLowerCase()}`
		);
		req.resolve(allow);
		this.dialogOpen = this.pending.length > 0;
	}

	/** Deny everything still queued (e.g. on stop/lock). */
	clearPending() {
		for (const r of this.pending) r.resolve(false);
		this.pending = [];
		this.dialogOpen = false;
	}

	#clearPendingFor(appId: string) {
		const keep = this.pending.filter((r) => {
			if (r.appId === appId) {
				r.resolve(false);
				return false;
			}
			return true;
		});
		this.pending = keep;
		this.dialogOpen = this.pending.length > 0;
	}

	/**
	 * Log the request, then resolve via policy: autoApprove / per-app trustApp →
	 * allow; remembered grant → allow; remembered reject → deny; else queue a
	 * dialog decision. Returns a value (or Promise) for the provider callback.
	 */
	#decide(
		appId: string,
		kind: ApprovalKind,
		permKey: string,
		client: string,
		summary: string,
		detail?: unknown
	): boolean | Promise<boolean> {
		const app = bunkerApps.get(appId);
		this.#log('request', appId, `${APPROVAL_LABEL[kind].toLowerCase()} · ${summary}`);
		if (!app) return false;
		if (this.autoApprove || app.trustApp) {
			this.#log('grant', appId, 'auto-approved');
			return true;
		}
		const verdict = check(app, permKey);
		if (verdict === 'accept') {
			this.#log('grant', appId, `remembered: ${permLabel(permKey)}`);
			return true;
		}
		if (verdict === 'reject') {
			this.#log('request', appId, `remembered-deny: ${permLabel(permKey)}`);
			return false;
		}
		return new Promise<boolean>((resolve) => {
			this.pending = [
				...this.pending,
				{
					id: this.#approvalSeq++,
					appId,
					kind,
					client,
					summary,
					detail: detail === undefined ? undefined : JSON.stringify(detail, null, 2),
					permKey,
					resolve
				}
			];
			this.dialogOpen = true;
		});
	}

	// --- helpers -------------------------------------------------------------

	#parsedRelays(): string[] {
		return this.sharedRelays
			.split(',')
			.map((r) => normalizeRelay(r))
			.filter(Boolean);
	}

	#setStatus(id: string, status: Status) {
		if (this.slots[id]) this.slots[id].status = status;
	}

	#log(kind: LogKind, appId: string, msg: string) {
		this.logs = [{ id: this.#logSeq++, ts: new Date(), kind, appId, msg }, ...this.logs].slice(
			0,
			100
		);
	}

	clearLogs() {
		this.logs = [];
	}
}

/** App-wide bunker runtime singleton. Started/stopped by the root layout from
 * the keyholder lifecycle; the approval dialog renders globally. */
export const bunker = new BunkerRuntime();
