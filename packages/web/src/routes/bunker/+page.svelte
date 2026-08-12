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

	// One relay pool for the app; RelayPool manages connections to whatever relays
	// the provider subscribes/publishes to.
	const pool = new RelayPool();

	let relay = $state('wss://relay.nsec.app/');
	let provider = $state<NostrConnectProvider | null>(null);
	let bunkerUri = $state<string | null>(null);
	let running = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let copied = $state(false);

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

	async function start() {
		if (keyholder.locked) {
			error = 'Unlock your key first (Log in).';
			return;
		}
		busy = true;
		error = null;
		try {
			const p = new NostrConnectProvider({
				relays: [relay],
				// The store IS the ISigner: getPublicKey/signEvent/nip04/nip44 route
				// straight to the Worker-held key. No adapter needed.
				upstream: keyholder,
				bunkerSecret: crypto.randomUUID(),
				pool: { subscription: pool.subscription.bind(pool), publish: pool.publish.bind(pool) },
				onClientConnect: (client) => addLog('connect', `client connected: ${client.slice(0, 16)}…`),
				onClientDisconnect: () => addLog('disconnect', 'client disconnected'),
				// ponytail: auto-approve for this increment. A per-request approval
				// dialog + an auto/per-request switch lands next.
				onConnect: (_client, perms) => {
					addLog('request', `connect${perms?.length ? ` · ${perms.join(', ')}` : ''}`);
					return true;
				},
				onSignEvent: (draft) => {
					addLog('request', `sign_event · kind ${draft.kind}`);
					return true;
				},
				onNip04Encrypt: (_pk, plaintext) => {
					addLog('request', `nip04_encrypt · ${plaintext.length} chars`);
					return true;
				},
				onNip04Decrypt: () => {
					addLog('request', 'nip04_decrypt');
					return true;
				},
				onNip44Encrypt: (_pk, plaintext) => {
					addLog('request', `nip44_encrypt · ${plaintext.length} chars`);
					return true;
				},
				onNip44Decrypt: () => {
					addLog('request', 'nip44_decrypt');
					return true;
				},
				onLogout: () => addLog('disconnect', 'client logged out (session ended)')
			});
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

	async function stop() {
		busy = true;
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
	Turn this tab into a Nostr Connect bunker. A client imports the bunker URI and sends signing
	requests over a relay; this page signs them with the key held in the Worker. The tab must stay
	open and unlocked — closing or idling drops the key.
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
	<div
		class="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
	>
		<strong>Auto-approve is on.</strong> Every connect / sign / encrypt request from a client is accepted
		automatically. Only run this against a relay and a client you trust — a connected client can sign
		anything as your key until you stop the bunker or the key locks. Per-request approval is coming next.
	</div>

	<Card class="mt-4">
		<CardHeader>
			<CardTitle>Provider</CardTitle>
			<CardDescription>Pick a relay and start broadcasting a bunker URI.</CardDescription>
		</CardHeader>
		<CardContent class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<Label for="relay">Relay</Label>
				<Input id="relay" bind:value={relay} disabled={running} placeholder="wss://…" />
				<p class="text-xs text-muted-foreground">
					The relay both sides exchange kind-24133 request/response events over. Pick one you and
					the client both use.
				</p>
			</div>

			{#if error}
				<p class="text-sm text-destructive">{error}</p>
			{/if}

			<div class="flex gap-2">
				{#if running}
					<Button variant="destructive" onclick={stop} disabled={busy}>
						{busy ? 'Stopping…' : 'Stop bunker'}
					</Button>
				{:else}
					<Button onclick={start} disabled={busy}>{busy ? 'Starting…' : 'Start bunker'}</Button>
				{/if}
			</div>

			{#if running && bunkerUri}
				<Separator />
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
						Paste this into a Nostr client's "add remote signer / bunker" field. The pubkey in the
						URI is this session's transport identity; the client learns your real npub after
						connecting.
					</p>
				</div>
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
