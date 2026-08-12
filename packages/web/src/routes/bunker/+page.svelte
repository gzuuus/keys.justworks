<script lang="ts">
	import { onDestroy } from 'svelte';
	import { keyholder } from '$lib/keyholder/store.svelte';
	import { bunkerApps, type BunkerApp } from '$lib/bunker/apps.svelte';
	import { BunkerRuntime } from '$lib/bunker/bunkers.svelte';
	import { short, permLabel, describeDecision, type Duration } from '$lib/bunker/policy';
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
	import { ToggleGroup, ToggleGroupItem } from '$lib/components/ui/toggle-group';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import {
		Collapsible,
		CollapsibleContent,
		CollapsibleTrigger
	} from '$lib/components/ui/collapsible';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import {
		Dialog,
		DialogContent,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';

	// Page-scoped runtime: one shared RelayPool, N providers over it. Persisted app
	// records (bunkerApps) survive across mounts/reloads; live providers do not.
	const bunker = new BunkerRuntime();

	let connectUri = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let copiedId = $state<string | null>(null);
	let editingId = $state<string | null>(null);
	let draftName = $state('');
	let remember = $state<Duration>('once');
	let cardOpen = $state<Record<string, boolean>>({});
	const isOpen = (id: string) => cardOpen[id] ?? true;
	// ToggleGroup's default on-state (bg-muted) is too close to the resting bg to
	// read as selected — make the active duration primary-colored.
	const DURATION_ON =
		'data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground';

	function startEdit(app: BunkerApp) {
		editingId = app.id;
		draftName = app.name;
	}
	function saveEdit() {
		if (editingId) bunkerApps.rename(editingId, draftName);
		editingId = null;
	}

	// Drive lifecycle from the keyholder: owner scope + reconnect on unlock,
	// stop everything on lock. Transition-guarded — `configuredFor` is a plain,
	// non-reactive var, so the effect only acts on a real lock/unlock change and
	// can never feed back into itself. Dialog dismissal is event-driven
	// (onOpenChange), not an effect, for the same reason.
	let configuredFor: string | null | undefined = undefined;
	$effect(() => {
		const target: string | null = keyholder.locked || !keyholder.npub ? null : keyholder.npub;
		if (target === configuredFor) return;
		configuredFor = target;
		if (target) {
			bunkerApps.setOwner(target);
			void bunker.startAll();
		} else {
			bunkerApps.setOwner(null);
			void bunker.stopAll();
		}
	});

	onDestroy(() => {
		void bunker.stopAll();
	});

	const STATUS_VARIANT = {
		listening: 'secondary',
		connected: 'default',
		stopped: 'outline'
	} as const;

	function name(app: BunkerApp): string {
		return app.name || (app.clientPubkey ? short(app.clientPubkey) : 'Bunker slot');
	}
	function appName(id: string): string {
		const app = bunkerApps.get(id);
		return app ? name(app) : 'Bunker slot';
	}
	function status(app: BunkerApp) {
		return bunker.slots[app.id]?.status ?? 'stopped';
	}

	async function addBunker() {
		busy = true;
		error = null;
		try {
			await bunker.createBunker();
		} catch (e) {
			error = e instanceof Error ? e.message : 'failed to start bunker';
		} finally {
			busy = false;
		}
	}

	async function addNostrconnect() {
		busy = true;
		error = null;
		try {
			await bunker.createNostrconnect(connectUri);
			connectUri = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'failed to connect';
		} finally {
			busy = false;
		}
	}

	async function copyUri(id: string, uri: string) {
		try {
			await navigator.clipboard.writeText(uri);
			copiedId = id;
			setTimeout(() => (copiedId = null), 1500);
		} catch {
			// clipboard unavailable (insecure context) — leave the text selectable
		}
	}

	function front() {
		return bunker.pending[0];
	}
</script>

<svelte:head>
	<title>Bunker · keys.justworks</title>
</svelte:head>

<h1 class="text-xl font-semibold">Bunker (NIP-46 remote signer)</h1>

<p class="mt-2 text-sm text-muted-foreground">
	Turn this tab into a Nostr Connect bunker. A client imports a bunker URI (or hands you a
	nostrconnect URI) and sends signing requests over a relay; this page signs them with the key held
	in the Worker. Each slot keeps a stable transport identity, so reloading reconnects your clients
	automatically once you unlock. The tab must stay open and unlocked — closing or idling drops the
	key.
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
	{#if bunker.autoApprove}
		<div
			class="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
		>
			<strong>Auto-approve is on.</strong> Every connect / sign / encrypt request is accepted automatically
			across all slots. Only run this against relays and clients you trust — a connected client can sign
			anything as your key until you stop the slot or the key locks.
		</div>
	{/if}

	<Card class="mt-4">
		<CardHeader>
			<CardTitle>Add a client</CardTitle>
			<CardDescription>Default relays, approval policy, and how to connect.</CardDescription>
		</CardHeader>
		<CardContent class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<Label for="relay">Default relays (bunker:// slots)</Label>
				<Input id="relay" bind:value={bunker.sharedRelays} placeholder="wss://a, wss://b" />
				<p class="text-xs text-muted-foreground">
					Comma-separated. nostrconnect:// slots use the client's own relays.
				</p>
			</div>

			<div class="flex items-center gap-3">
				<Switch id="auto" bind:checked={bunker.autoApprove} />
				<Label for="auto" class="cursor-pointer">
					Auto-approve (all slots)
					<span class="block text-xs font-normal text-muted-foreground">
						Off = approve each unresolved request. On = sign everything automatically.
					</span>
				</Label>
			</div>

			<Separator />

			<div class="flex flex-col gap-2">
				<Label>Bunker URI (provider-initiated)</Label>
				<p class="text-xs text-muted-foreground">
					Start a slot and hand its URI to a client's "add remote signer / bunker" field.
				</p>
				<Button onclick={addBunker} disabled={busy} class="self-start">
					{busy && !connectUri ? 'Starting…' : 'Start bunker slot'}
				</Button>
			</div>

			<div class="flex flex-col gap-2">
				<Label for="connect-uri">nostrconnect:// URI (client-initiated)</Label>
				<Input
					id="connect-uri"
					bind:value={connectUri}
					placeholder="nostrconnect://…"
					onkeydown={(e) => e.key === 'Enter' && connectUri.trim() && addNostrconnect()}
				/>
				<Button
					variant="outline"
					onclick={addNostrconnect}
					disabled={busy || !connectUri.trim()}
					class="self-start"
				>
					Connect to client
				</Button>
			</div>

			{#if error}
				<p class="text-sm text-destructive">{error}</p>
			{/if}
		</CardContent>
	</Card>

	{#each bunkerApps.apps as app (app.id)}
		<Card class="mt-4">
			<Collapsible
				open={isOpen(app.id)}
				onOpenChange={(o) => (cardOpen[app.id] = o)}
				class="flex flex-col gap-(--card-spacing)"
			>
				<CardHeader>
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div class="flex flex-wrap items-center gap-2">
							{#if editingId === app.id}
								<Input
									bind:value={draftName}
									class="h-8 max-w-[14rem]"
									placeholder="Slot name"
									onkeydown={(e) => {
										if (e.key === 'Enter') saveEdit();
										if (e.key === 'Escape') editingId = null;
									}}
									onblur={saveEdit}
								/>
							{:else}
								<CardTitle
									class="cursor-text text-base"
									onclick={() => startEdit(app)}
									title="Click to rename">{name(app)}</CardTitle
								>
							{/if}
							<Badge variant={STATUS_VARIANT[status(app)]}>{status(app)}</Badge>
							<Badge variant="outline">{app.mode}</Badge>
							{#if app.trustApp}
								<Badge variant="secondary">trusted</Badge>
							{/if}
						</div>
						<CollapsibleTrigger
							class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent"
							aria-label={isOpen(app.id) ? 'Collapse' : 'Expand'}
						>
							<ChevronDown
								class="size-4 transition-transform {isOpen(app.id) ? 'rotate-180' : ''}"
							/>
						</CollapsibleTrigger>
					</div>
					<CardDescription class="flex flex-col gap-0.5">
						<span>{app.relays.join(', ')}</span>
						{#if app.clientPubkey}
							<span class="font-mono text-xs">client {short(app.clientPubkey)}</span>
						{:else}
							<span class="text-xs">no client connected yet</span>
						{/if}
					</CardDescription>
				</CardHeader>
				<CollapsibleContent>
					<CardContent class="flex flex-col gap-4">
						<div class="flex items-center gap-3">
							<Switch
								id="trust-{app.id}"
								checked={app.trustApp}
								onCheckedChange={(v) => bunkerApps.setTrust(app.id, v)}
							/>
							<Label for="trust-{app.id}" class="cursor-pointer">
								Trust this client
								<span class="block text-xs font-normal text-muted-foreground">
									Auto-approve every request from this slot.
								</span>
							</Label>
						</div>

						{#if bunker.slots[app.id]?.bunkerUri}
							<div class="flex flex-col gap-2">
								<Label>Bunker URI</Label>
								<code
									class="block max-h-32 overflow-auto rounded-md bg-muted p-2 font-mono text-xs break-all"
									>{bunker.slots[app.id]!.bunkerUri}</code
								>
								<div>
									<Button
										variant="outline"
										size="sm"
										onclick={() => copyUri(app.id, bunker.slots[app.id]!.bunkerUri!)}
									>
										{copiedId === app.id ? 'Copied' : 'Copy URI'}
									</Button>
								</div>
								<p class="text-xs text-muted-foreground">
									The pubkey in the URI is this slot's transport identity; the client learns your
									real npub after connecting.
								</p>
							</div>
						{/if}

						{#if bunker.slots[app.id]?.error}
							<p class="text-sm text-destructive">{bunker.slots[app.id]!.error}</p>
						{/if}

						{#if Object.keys(app.permissions).length}
							<div class="flex flex-col gap-1.5">
								<span class="text-xs font-medium text-muted-foreground">Remembered grants</span>
								{#each Object.entries(app.permissions) as [key, d] (key)}
									<div class="flex items-center gap-2 text-xs">
										<span class="flex-1 break-all">{permLabel(key)}</span>
										<Badge variant="outline">{describeDecision(d)}</Badge>
										<Button
											variant="ghost"
											size="sm"
											class="h-6 px-2 text-xs"
											onclick={() => bunkerApps.revoke(app.id, key)}>Revoke</Button
										>
									</div>
								{/each}
							</div>
						{/if}

						<Separator />

						<div class="flex flex-wrap items-center gap-2">
							{#if status(app) === 'stopped'}
								<Button variant="outline" size="sm" onclick={() => bunker.restart(app.id)}
									>Start</Button
								>
							{:else}
								<Button variant="outline" size="sm" onclick={() => bunker.stop(app.id)}>Stop</Button
								>
							{/if}
							<Button
								variant="outline"
								size="sm"
								onclick={() => bunker.restart(app.id)}
								disabled={status(app) === 'stopped'}>Restart</Button
							>
							<Button variant="destructive" size="sm" onclick={() => bunker.remove(app.id)}
								>Remove</Button
							>
						</div>
					</CardContent>
				</CollapsibleContent>
			</Collapsible>
		</Card>
	{:else}
		<Card class="mt-4 border-dashed">
			<CardContent class="py-8 text-center text-sm text-muted-foreground">
				No bunker slots yet. Start a bunker slot above, or paste a nostrconnect URI from a client.
			</CardContent>
		</Card>
	{/each}

	<Card class="mt-4">
		<CardHeader>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div>
					<CardTitle>Activity</CardTitle>
					<CardDescription>
						Relay/provider events and incoming client requests across all slots.
					</CardDescription>
				</div>
				{#if bunker.logs.length}
					<Button variant="outline" size="sm" onclick={() => bunker.clearLogs()}>Clear</Button>
				{/if}
			</div>
		</CardHeader>
		<CardContent>
			{#if bunker.logs.length === 0}
				<p class="py-6 text-center text-sm text-muted-foreground">
					No activity yet. Add a slot, then connect a client.
				</p>
			{:else}
				<ScrollArea class="h-80">
					<ul class="flex flex-col gap-1.5 pr-3">
						{#each bunker.logs as entry (entry.id)}
							<li class="flex items-start gap-2 text-sm">
								<Badge
									variant={bunker.logVariant[entry.kind]}
									class="mt-0.5 shrink-0 font-mono text-xs"
								>
									{entry.kind}
								</Badge>
								<span class="shrink-0 text-xs text-muted-foreground">{appName(entry.appId)}</span>
								<span class="flex-1 break-all">{entry.msg}</span>
								<span class="shrink-0 text-xs text-muted-foreground">
									{entry.ts.toLocaleTimeString()}
								</span>
							</li>
						{/each}
					</ul>
				</ScrollArea>
			{/if}
		</CardContent>
	</Card>
{/if}

<Dialog
	bind:open={bunker.dialogOpen}
	onOpenChange={(open) => {
		if (!open) bunker.decide(false);
	}}
>
	<DialogContent showCloseButton={false}>
		{#if front()}
			{@const req = front()!}
			<DialogHeader>
				<DialogTitle>Approve {req.kind.replace('_', ' ')}?</DialogTitle>
			</DialogHeader>
			<div class="flex flex-col gap-2 text-sm">
				<p class="text-muted-foreground">
					{appName(req.appId)} · client
					<code class="font-mono">{short(req.client)}</code> · {req.summary}
				</p>
				{#if req.detail}
					<pre
						class="max-h-64 overflow-auto rounded-md bg-muted p-2 font-mono text-xs break-all whitespace-pre-wrap">{req.detail}</pre>
				{/if}
			</div>
			<DialogFooter>
				<div class="flex w-full flex-col gap-3">
					<div class="flex items-center gap-2">
						<span class="text-xs text-muted-foreground">Remember</span>
						<ToggleGroup type="single" bind:value={remember} variant="outline" size="sm">
							<ToggleGroupItem value="once" class={DURATION_ON}>Once</ToggleGroupItem>
							<ToggleGroupItem value="5min" class={DURATION_ON}>5 min</ToggleGroupItem>
							<ToggleGroupItem value="1h" class={DURATION_ON}>1 hour</ToggleGroupItem>
							<ToggleGroupItem value="always" class={DURATION_ON}>Always</ToggleGroupItem>
						</ToggleGroup>
					</div>
					<div class="flex justify-end gap-2">
						<Button variant="outline" onclick={() => bunker.decide(false)}>Deny</Button>
						<Button
							onclick={() => {
								bunker.decide(true, remember);
								remember = 'once';
							}}>Allow</Button
						>
					</div>
				</div>
			</DialogFooter>
		{/if}
	</DialogContent>
</Dialog>
