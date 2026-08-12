<script lang="ts">
	import { onDestroy } from 'svelte';
	import { RelayPool } from 'applesauce-relay';
	import { NostrConnectProvider } from 'applesauce-signers';
	import { keyholder } from '$lib/keyholder/store.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { Switch } from '$lib/components/ui/switch';
	import {
		Dialog,
		DialogContent,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';

	// One relay pool for the app; RelayPool manages connections to whatever relays
	// the provider subscribes/publishes to.
	const pool = new RelayPool();

	let relay = $state('wss://relay.nsec.app/');
	let connectUri = $state(''); // nostrconnect:// URI (client-initiated flow)
	let provider = $state<NostrConnectProvider | null>(null);
	let bunkerUri = $state<string | null>(null);
	let running = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let copied = $state(false);

	// Approval policy. On (true) = auto-approve every request. Off = each request
	// opens a dialog and waits for an Allow/Deny click. Off is the safer default.
	let autoApprove = $state(false);

	type LogKind = 'info' | 'connect' | 'disconnect' | 'request' | 'error';
	const logVariant: Record<LogKind, 'default' | 'secondary' | 'destructive' | 'outline'> = {
		info: 'secondary',
		connect: 'default',
		disconnect: 'outline',
		request: 'default',
		error: 'destructive'
	};
	interface LogEntry {
		id: number;
		ts: Date;
		kind: LogKind;
		msg: string;
	}
	let logSeq = 0;
	let logs = $state<LogEntry[]>([]);
	function addLog(kind: LogKind, msg: string) {
		logs = [{ id: logSeq++, ts: new Date(), kind, msg }, ...logs].slice(0, 200);
	}

	// --- approval queue (per-request mode) -------------------------------------

	type ApprovalKind =
		| 'connect'
		| 'sign_event'
		| 'nip04_encrypt'
		| 'nip04_decrypt'
		| 'nip44_encrypt'
		| 'nip44_decrypt';
	const kindLabel: Record<ApprovalKind, string> = {
		connect: 'Connect',
		sign_event: 'Sign event',
		nip04_encrypt: 'NIP-04 encrypt',
		nip04_decrypt: 'NIP-04 decrypt',
		nip44_encrypt: 'NIP-44 encrypt',
		nip44_decrypt: 'NIP-44 decrypt'
	};
	interface ApprovalRequest {
		id: number;
		kind: ApprovalKind;
		client: string;
		summary: string;
		detail?: string; // pretty-printed JSON, for the "view" pane
		resolve: (allow: boolean) => void;
	}
	let pending = $state<ApprovalRequest[]>([]);
	let dialogOpen = $state(false);
	let approvalSeq = 0;

	function short(pk: string): string {
		return pk.length > 16 ? `${pk.slice(0, 8)}…${pk.slice(-4)}` : pk;
	}

	/** Log the request, then either auto-allow or queue it for a dialog decision. */
	function ask(kind: ApprovalKind, client: string, summary: string, detail?: unknown) {
		addLog('request', `${kindLabel[kind].toLowerCase()} · ${summary}`);
		if (autoApprove) return true;
		return new Promise<boolean>((resolve) => {
			pending = [
				...pending,
				{
					id: approvalSeq++,
					kind,
					client,
					summary,
					detail: detail === undefined ? undefined : JSON.stringify(detail, null, 2),
					resolve
				}
			];
			dialogOpen = true;
		});
	}

	function decide(allow: boolean) {
		const [req, ...rest] = pending;
		if (!req) return;
		pending = rest;
		req.resolve(allow);
		dialogOpen = pending.length > 0;
	}

	/** Dismissed via Escape/overlay while a request waits → treat as denied, show next. */
	$effect(() => {
		if (!dialogOpen && pending.length > 0) decide(false);
	});

	function clearPending() {
		for (const r of pending) r.resolve(false);
		pending = [];
		dialogOpen = false;
	}

	// --- provider lifecycle ----------------------------------------------------

	function makeProvider(): NostrConnectProvider {
		return new NostrConnectProvider({
			relays: [relay],
			// The store IS the ISigner: getPublicKey/signEvent/nip04/nip44 route
			// straight to the Worker-held key. No adapter needed.
			upstream: keyholder,
			bunkerSecret: crypto.randomUUID(),
			pool: { subscription: pool.subscription.bind(pool), publish: pool.publish.bind(pool) },
			onClientConnect: (client) => addLog('connect', `client connected: ${short(client)}`),
			onClientDisconnect: () => addLog('disconnect', 'client disconnected'),
			onConnect: (client, perms) =>
				ask(
					'connect',
					client,
					`client ${short(client)}${perms?.length ? ` · ${perms.join(', ')}` : ''}`
				),
			onSignEvent: (draft, client) => ask('sign_event', client, `kind ${draft.kind}`, draft),
			onNip04Encrypt: (pk, plaintext, client) =>
				ask('nip04_encrypt', client, `to ${short(pk)} · ${plaintext.length} chars`),
			onNip04Decrypt: (pk, _ct, client) => ask('nip04_decrypt', client, `from ${short(pk)}`),
			onNip44Encrypt: (pk, plaintext, client) =>
				ask('nip44_encrypt', client, `to ${short(pk)} · ${plaintext.length} chars`),
			onNip44Decrypt: (pk, _ct, client) => ask('nip44_decrypt', client, `from ${short(pk)}`),
			onLogout: () => addLog('disconnect', 'client logged out (session ended)')
		});
	}

	async function startBunker() {
		if (keyholder.locked) {
			error = 'Unlock your key first (Log in).';
			return;
		}
		busy = true;
		error = null;
		try {
			const p = makeProvider();
			await p.start();
			bunkerUri = await p.getBunkerURI();
			provider = p;
			running = true;
			addLog('info', `provider listening on ${relay}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'failed to start provider';
			addLog('error', error);
		} finally {
			busy = false;
		}
	}

	async function startWithUri() {
		if (keyholder.locked) {
			error = 'Unlock your key first (Log in).';
			return;
		}
		const uri = connectUri.trim();
		if (!uri.startsWith('nostrconnect://')) {
			error = 'Paste a nostrconnect:// URI from the client.';
			return;
		}
		busy = true;
		error = null;
		try {
			const p = makeProvider();
			await p.start(uri);
			provider = p;
			bunkerUri = null; // client-initiated: no bunker:// URI from us
			running = true;
			addLog('info', `connecting to client via nostrconnect URI`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'failed to connect';
			addLog('error', error);
		} finally {
			busy = false;
		}
	}

	async function stop() {
		busy = true;
		clearPending();
		try {
			await provider?.stop();
		} catch (e) {
			addLog('error', e instanceof Error ? e.message : 'stop failed');
		} finally {
			provider = null;
			bunkerUri = null;
			running = false;
			busy = false;
			addLog('info', 'provider stopped');
		}
	}

	// A locked key can't sign — don't leave a half-broken bunker running.
	$effect(() => {
		if (keyholder.locked && provider) void stop();
	});

	async function copyUri() {
		if (!bunkerUri) return;
		try {
			await navigator.clipboard.writeText(bunkerUri);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			// clipboard unavailable (insecure context) — leave the text selectable
		}
	}

	onDestroy(() => {
		void provider?.stop();
	});
</script>

<svelte:head>
	<title>Bunker · keys.justworks</title>
</svelte:head>

<h1 class="text-xl font-semibold">Bunker (NIP-46 remote signer)</h1>

<p class="mt-2 text-sm text-muted-foreground">
	Turn this tab into a Nostr Connect bunker. A client imports the bunker URI (or hands you a
	nostrconnect URI) and sends signing requests over a relay; this page signs them with the key held
	in the Worker. The tab must stay open and unlocked — closing or idling drops the key.
</p>

{#if keyholder.locked}
	<Card class="mt-6">
		<CardHeader>
			<CardTitle>Unlock required</CardTitle>
			<CardDescription
				>The bunker signs with the key held in the Worker. Unlock it first.</CardDescription
			>
		</CardHeader>
		<CardContent>
			<Button href="/login">Go to Log in</Button>
		</CardContent>
	</Card>
{:else}
	{#if autoApprove}
		<div
			class="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
		>
			<strong>Auto-approve is on.</strong> Every connect / sign / encrypt request is accepted automatically.
			Only run this against a relay and a client you trust — a connected client can sign anything as your
			key until you stop the bunker or the key locks.
		</div>
	{/if}

	<Card class="mt-4">
		<CardHeader>
			<CardTitle>Provider</CardTitle>
			<CardDescription>Relay, approval policy, and how to start.</CardDescription>
		</CardHeader>
		<CardContent class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<Label for="relay">Relay</Label>
				<Input id="relay" bind:value={relay} disabled={running} placeholder="wss://…" />
			</div>

			<div class="flex items-center gap-3">
				<Switch id="auto" bind:checked={autoApprove} disabled={running} />
				<Label for="auto" class="cursor-pointer">
					Auto-approve
					<span class="block text-xs font-normal text-muted-foreground">
						Off = approve each request. On = sign everything automatically.
					</span>
				</Label>
			</div>

			<Separator />

			<div class="flex flex-col gap-2">
				<Label>Bunker URI (provider-initiated)</Label>
				<p class="text-xs text-muted-foreground">
					Start and hand the URI to a client's "add remote signer / bunker" field.
				</p>
				<Button onclick={startBunker} disabled={busy || running} class="self-start">
					{busy && !connectUri ? 'Starting…' : 'Start bunker'}
				</Button>
			</div>

			<div class="flex flex-col gap-2">
				<Label for="connect-uri">nostrconnect:// URI (client-initiated)</Label>
				<Input
					id="connect-uri"
					bind:value={connectUri}
					disabled={running}
					placeholder="nostrconnect://…"
				/>
				<Button
					variant="outline"
					onclick={startWithUri}
					disabled={busy || running}
					class="self-start"
				>
					Connect to client
				</Button>
			</div>

			{#if error}
				<p class="text-sm text-destructive">{error}</p>
			{/if}

			{#if running}
				<Separator />
				<div class="flex items-center gap-2">
					<Button variant="destructive" onclick={stop} disabled={busy}>Stop bunker</Button>
					<Badge variant="secondary">running</Badge>
					{#if pending.length > 0}
						<Badge variant="outline">{pending.length} pending</Badge>
					{/if}
				</div>

				{#if bunkerUri}
					<div class="flex flex-col gap-2">
						<Label>Bunker URI</Label>
						<code
							class="block max-h-32 overflow-auto rounded-md bg-muted p-2 font-mono text-xs break-all"
							>{bunkerUri}</code
						>
						<div>
							<Button variant="outline" size="sm" onclick={copyUri}>
								{copied ? 'Copied' : 'Copy URI'}
							</Button>
						</div>
						<p class="text-xs text-muted-foreground">
							The pubkey in the URI is this session's transport identity; the client learns your
							real npub after connecting.
						</p>
					</div>
				{/if}
			{/if}
		</CardContent>
	</Card>

	<Card class="mt-4">
		<CardHeader>
			<CardTitle>Activity</CardTitle>
			<CardDescription>Relay/provider events and incoming client requests.</CardDescription>
		</CardHeader>
		<CardContent>
			{#if logs.length === 0}
				<p class="py-6 text-center text-sm text-muted-foreground">
					No activity yet. Start the bunker, then connect a client.
				</p>
			{:else}
				<ul class="flex flex-col gap-1.5">
					{#each logs as entry (entry.id)}
						<li class="flex items-start gap-2 text-sm">
							<Badge variant={logVariant[entry.kind]} class="mt-0.5 shrink-0 font-mono text-xs">
								{entry.kind}
							</Badge>
							<span class="flex-1 break-all">{entry.msg}</span>
							<span class="shrink-0 text-xs text-muted-foreground">
								{entry.ts.toLocaleTimeString()}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</CardContent>
	</Card>
{/if}

<Dialog bind:open={dialogOpen}>
	<DialogContent showCloseButton={false}>
		{#if pending.length > 0}
			{@const req = pending[0]}
			<DialogHeader>
				<DialogTitle>Approve {kindLabel[req.kind].toLowerCase()}?</DialogTitle>
			</DialogHeader>
			<div class="flex flex-col gap-2 text-sm">
				<p class="text-muted-foreground">
					Client <code class="font-mono">{short(req.client)}</code> · {req.summary}
				</p>
				{#if req.detail}
					<pre
						class="max-h-64 overflow-auto rounded-md bg-muted p-2 font-mono text-xs break-all whitespace-pre-wrap">{req.detail}</pre>
				{/if}
			</div>
			<DialogFooter>
				<Button variant="outline" onclick={() => decide(false)}>Deny</Button>
				<Button onclick={() => decide(true)}>Allow</Button>
			</DialogFooter>
		{/if}
	</DialogContent>
</Dialog>
