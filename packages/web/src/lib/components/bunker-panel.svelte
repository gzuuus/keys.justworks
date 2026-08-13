<!--
	keys.justworks — "Connected apps" panel (NIP-46 bunker management).

	The bunker runtime is an app-wide singleton (bunkers.svelte.ts) driven by the
	root layout from the keyholder lifecycle, so this panel is pure UI over shared
	state — it reads `bunker` + `bunkerApps`, no runtime of its own. The approval
	dialog lives globally (approval-dialog.svelte), so requests are answerable
	from any page. Rendered inside the dashboard when a key is unlocked.
-->
<script lang="ts">
	import { bunker } from '$lib/bunker/bunkers.svelte';
	import { bunkerApps, displayName, type BunkerApp } from '$lib/bunker/apps.svelte';
	import { short, permLabel, describeDecision } from '$lib/bunker/policy';
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
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import {
		Collapsible,
		CollapsibleContent,
		CollapsibleTrigger
	} from '$lib/components/ui/collapsible';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import Plug from '@lucide/svelte/icons/plug';
	import Link from '@lucide/svelte/icons/link';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';

	let connectUri = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	/** Which connection flow is revealed: null = the two-button chooser. */
	let mode = $state<'bunker' | 'nostrconnect' | null>(null);
	let advancedOpen = $state(false);
	let copiedId = $state<string | null>(null);
	let editingId = $state<string | null>(null);
	let draftName = $state('');
	let cardOpen = $state<Record<string, boolean>>({});
	const isOpen = (id: string) => cardOpen[id] ?? true;

	function startEdit(app: BunkerApp) {
		editingId = app.id;
		draftName = app.name;
	}
	function saveEdit() {
		if (editingId) bunkerApps.rename(editingId, draftName);
		editingId = null;
	}
	function appName(id: string): string {
		const app = bunkerApps.get(id);
		return app ? displayName(app) : 'Bunker slot';
	}
	function status(app: BunkerApp) {
		return bunker.slots[app.id]?.status ?? 'stopped';
	}

	const STATUS_VARIANT = {
		listening: 'secondary',
		connected: 'default',
		stopped: 'outline'
	} as const;

	async function addBunker() {
		busy = true;
		error = null;
		try {
			await bunker.createBunker();
			mode = null; // collapse back; the new slot card appears below
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
			mode = null;
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
</script>

<section class="flex flex-col gap-4">
	<div class="flex items-center gap-2">
		<Plug class="size-5 text-mint-deep" />
		<h2 class="text-lg font-bold">Connected apps</h2>
		<span class="text-sm text-muted-foreground">
			Let other Nostr apps sign through this browser tab.
		</span>
	</div>

	{#if bunker.autoApprove}
		<Alert class="border-sun/40 bg-sun/10 text-[#8a5e10] dark:text-sun">
			<TriangleAlert class="size-4" />
			<AlertTitle>Auto-approve is on</AlertTitle>
			<AlertDescription>
				Every request is signed automatically across all apps. Only use this with relays and apps
				you trust — a connected app can sign anything as your key until you stop it or the key
				locks.
			</AlertDescription>
		</Alert>
	{/if}

	<Card>
		<CardHeader>
			<CardTitle>Connect an app</CardTitle>
			<CardDescription>Two ways to link a Nostr app to this key.</CardDescription>
		</CardHeader>
		<CardContent class="flex flex-col gap-4">
			{#if mode === null}
				<div class="grid gap-3 sm:grid-cols-2">
					<button
						type="button"
						class="border-line flex items-start gap-3 rounded-xl border bg-paper-strong p-4 text-left transition-colors hover:border-mint/50"
						onclick={() => (mode = 'bunker')}
					>
						<Link class="mt-0.5 size-5 shrink-0 text-mint-deep" />
						<span class="flex flex-col gap-1">
							<span class="text-sm font-semibold">Create a connection link</span>
							<span class="text-xs text-muted-foreground">
								You start it. Paste the link into your app's "remote signer" field.
							</span>
						</span>
					</button>
					<button
						type="button"
						class="border-line flex items-start gap-3 rounded-xl border bg-paper-strong p-4 text-left transition-colors hover:border-mint/50"
						onclick={() => (mode = 'nostrconnect')}
					>
						<Plug class="mt-0.5 size-5 shrink-0 text-mint-deep" />
						<span class="flex flex-col gap-1">
							<span class="text-sm font-semibold">Connect to an app</span>
							<span class="text-xs text-muted-foreground">
								Your app gives you a nostrconnect:// link to paste here.
							</span>
						</span>
					</button>
				</div>
			{:else}
				<div class="flex flex-col gap-3">
					<button
						type="button"
						class="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
						onclick={() => (mode = null)}
					>
						<ArrowLeft class="size-4" /> Back
					</button>
					{#if mode === 'bunker'}
						<div class="flex flex-col gap-2">
							<p class="text-sm font-medium">Create a connection link</p>
							<p class="text-xs text-muted-foreground">
								We'll generate a link you paste into your app's "remote signer" or "bunker" field.
								The app then sends signing requests here for you to approve.
							</p>
							<Button onclick={addBunker} disabled={busy} class="self-start">
								{busy ? 'Starting…' : 'Create connection'}
							</Button>
						</div>
					{:else}
						<div class="flex flex-col gap-2">
							<p class="text-sm font-medium">Connect to an app</p>
							<p class="text-xs text-muted-foreground">
								Paste the nostrconnect:// link your app gave you. We'll connect and ask you to
								approve each request.
							</p>
							<Input
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
								Connect
							</Button>
						</div>
					{/if}
					{#if error}
						<p class="text-sm text-destructive">{error}</p>
					{/if}
				</div>
			{/if}

			<Separator />

			<Collapsible bind:open={advancedOpen}>
				<CollapsibleTrigger
					class="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					Advanced
					<ChevronDown class="size-4 transition-transform {advancedOpen ? 'rotate-180' : ''}" />
				</CollapsibleTrigger>
				<CollapsibleContent>
					<div class="mt-3 flex flex-col gap-4">
						<div class="flex flex-col gap-2">
							<Label for="relay">Default relays (Nostr servers)</Label>
							<Input id="relay" bind:value={bunker.sharedRelays} placeholder="wss://a, wss://b" />
							<p class="text-xs text-muted-foreground">
								Comma-separated. Apps that give you a nostrconnect:// link use their own.
							</p>
						</div>
						<div class="flex items-center gap-3">
							<Switch id="auto" bind:checked={bunker.autoApprove} />
							<Label for="auto" class="cursor-pointer">
								Auto-approve (all apps)
								<span class="block text-xs font-normal text-muted-foreground">
									Off = you approve each request. On = everything is signed automatically.
								</span>
							</Label>
						</div>
					</div>
				</CollapsibleContent>
			</Collapsible>
		</CardContent>
	</Card>

	{#each bunkerApps.apps as app (app.id)}
		<Card>
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
									placeholder="App name"
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
									title="Click to rename">{displayName(app)}</CardTitle
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
							<span class="font-mono text-xs">app {short(app.clientPubkey)}</span>
						{:else}
							<span class="text-xs">no app connected yet</span>
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
								Trust this app
								<span class="block text-xs font-normal text-muted-foreground">
									Auto-approve every request from this app.
								</span>
							</Label>
						</div>

						{#if bunker.slots[app.id]?.bunkerUri}
							<div class="flex flex-col gap-2">
								<Label>Connection link</Label>
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
										{copiedId === app.id ? 'Copied' : 'Copy link'}
									</Button>
								</div>
								<p class="text-xs text-muted-foreground">
									The link shows a throwaway ID, not your real one. The app learns your real npub
									only after you approve the connection.
								</p>
							</div>
						{/if}

						{#if bunker.slots[app.id]?.error}
							<p class="text-sm text-destructive">{bunker.slots[app.id]!.error}</p>
						{/if}

						{#if Object.keys(app.permissions).length}
							<div class="flex flex-col gap-1.5">
								<span class="text-xs font-medium text-muted-foreground">Saved approvals</span>
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
		<Card class="border-dashed">
			<CardContent class="py-8 text-center text-sm text-muted-foreground">
				No apps connected yet. Create a connection above, or paste a nostrconnect:// link from an
				app.
			</CardContent>
		</Card>
	{/each}

	<Card>
		<CardHeader>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div>
					<CardTitle>Activity</CardTitle>
					<CardDescription>
						Connection events and signing requests across your apps.
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
					No activity yet. Create a connection, then connect an app.
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
</section>
