<script lang="ts">
	import { keyholder } from '$lib/keyholder/store.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import {
		Collapsible,
		CollapsibleContent,
		CollapsibleTrigger
	} from '$lib/components/ui/collapsible';
	import LockOpen from '@lucide/svelte/icons/lock-open';
	import Lock from '@lucide/svelte/icons/lock';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Plug from '@lucide/svelte/icons/plug';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Copy from '@lucide/svelte/icons/copy';
	import Check from '@lucide/svelte/icons/check';

	let verifyOpen = $state(false);
	let signedEvent = $state<string | null>(null);
	let signing = $state(false);
	let signError = $state<string | null>(null);
	let copiedNpub = $state(false);

	async function signTest() {
		if (keyholder.locked) return;
		signedEvent = null;
		signError = null;
		signing = true;
		try {
			const evt = await keyholder.signEvent({
				kind: 1,
				content: 'signed via keys.justworks worker keyholder',
				tags: [],
				created_at: Math.floor(Date.now() / 1000)
			});
			signedEvent = JSON.stringify(evt, null, 2);
		} catch (e) {
			signError = e instanceof Error ? e.message : 'signing failed';
		} finally {
			signing = false;
		}
	}

	async function copyNpub() {
		if (!keyholder.npub) return;
		try {
			await navigator.clipboard.writeText(keyholder.npub);
			copiedNpub = true;
			setTimeout(() => (copiedNpub = false), 1500);
		} catch {
			// clipboard unavailable
		}
	}

	async function lock() {
		signedEvent = null;
		await keyholder.lock();
	}
</script>

<svelte:head>
	<title>Dashboard · keys.justworks</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-4 py-12">
	{#if keyholder.locked || !keyholder.npub}
		<!-- Guard: nothing unlocked -->
		<Card class="mt-6">
			<CardContent class="flex flex-col items-center gap-4 py-14 text-center">
				<span
					class="inline-flex size-14 items-center justify-center rounded-2xl bg-accent text-muted-foreground"
				>
					<Lock class="size-7" />
				</span>
				<div>
					<h1 class="text-xl font-bold">No key unlocked</h1>
					<p class="mt-1 text-sm text-muted-foreground">
						Unlock your locker to hold the key for this session and use the signing tools.
					</p>
				</div>
				<div class="flex gap-3">
					<Button href="/login"><LockOpen class="size-4" /> Unlock</Button>
					<Button href="/get-started" variant="outline">Get started</Button>
				</div>
			</CardContent>
		</Card>
	{:else}
		<div class="flex items-center justify-between gap-4">
			<div>
				<p class="text-xs font-bold tracking-[0.2em] text-mint-deep uppercase">Dashboard</p>
				<h1 class="mt-2 text-3xl font-black tracking-tight">Your key is ready</h1>
			</div>
			<Badge class="gap-1.5 bg-mint/15 text-mint-deep">
				<span class="size-1.5 rounded-full bg-mint"></span> unlocked
			</Badge>
		</div>

		<!-- Identity card -->
		<Card class="mt-6">
			<CardHeader>
				<CardTitle class="flex items-center gap-2"
					><KeyRound class="size-5 text-mint-deep" /> Identity</CardTitle
				>
				<CardDescription
					>Your public key (npub). Share it freely — it can't sign anything.</CardDescription
				>
			</CardHeader>
			<CardContent class="flex flex-col gap-3">
				<div class="flex items-center gap-2">
					<code
						class="border-line flex-1 rounded-lg border bg-muted p-2.5 font-mono text-xs break-all"
						>{keyholder.npub}</code
					>
					<Button variant="outline" size="icon" onclick={copyNpub} aria-label="Copy npub">
						{#if copiedNpub}
							<Check class="size-4 text-mint-deep" />
						{:else}
							<Copy class="size-4" />
						{/if}
					</Button>
				</div>
				<div class="flex flex-wrap gap-3">
					<Button variant="destructive" onclick={lock}><Lock class="size-4" /> Lock key</Button>
					<span class="self-center text-xs text-muted-foreground">
						The key lives only in the Worker and auto-locks after ~30 min idle.
					</span>
				</div>
			</CardContent>
		</Card>

		<!-- Tools -->
		<h2 class="mt-10 text-xs font-bold tracking-[0.2em] text-quiet uppercase">Tools</h2>
		<div class="mt-3 grid gap-4 sm:grid-cols-2">
			<a
				href="/bunker"
				class="group border-line flex flex-col rounded-2xl border bg-paper-strong p-5 transition-transform hover:-translate-y-1"
			>
				<span
					class="inline-flex size-11 items-center justify-center rounded-xl bg-sun/20 text-[#8a5e10]"
				>
					<Plug class="size-5" />
				</span>
				<h3 class="mt-4 font-bold">
					Bunker <span class="font-normal text-muted-foreground">NIP-46</span>
				</h3>
				<p class="mt-1.5 flex-1 text-sm text-muted-foreground">
					Let other Nostr apps sign through this tab over a relay. Approve each request.
				</p>
				<span class="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-mint-deep">
					Open bunker <ArrowRight class="size-4 transition-transform group-hover:translate-x-0.5" />
				</span>
			</a>

			<Collapsible class="border-line rounded-2xl border bg-paper-strong p-5">
				<CollapsibleTrigger class="flex w-full items-start gap-3 text-left">
					<span
						class="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-mint-deep"
					>
						<ShieldCheck class="size-5" />
					</span>
					<span class="flex-1">
						<span class="block font-bold">Verify your key</span>
						<span class="mt-1.5 block text-sm text-muted-foreground">
							Sign a throwaway test note to confirm the key works.
						</span>
					</span>
					<ChevronDown
						class="size-5 shrink-0 text-muted-foreground transition-transform {verifyOpen
							? 'rotate-180'
							: ''}"
					/>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<div class="border-line mt-4 border-t pt-4">
						<Button variant="outline" size="sm" onclick={signTest} disabled={signing}>
							{signing ? 'Signing…' : 'Sign a test note'}
						</Button>
						{#if signError}
							<p class="mt-3 text-sm text-destructive">{signError}</p>
						{/if}
						{#if signedEvent}
							<pre
								class="mt-3 max-h-64 overflow-auto rounded-lg bg-ink p-3 font-mono text-xs break-all whitespace-pre-wrap text-paper-strong">{signedEvent}</pre>
						{/if}
					</div>
				</CollapsibleContent>
			</Collapsible>
		</div>
	{/if}
</div>
