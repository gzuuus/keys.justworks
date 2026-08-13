<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { keyholder } from '$lib/keyholder/store.svelte';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import CloudOff from '@lucide/svelte/icons/cloud-off';
	import Server from '@lucide/svelte/icons/server';
	import Smartphone from '@lucide/svelte/icons/smartphone';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Zap from '@lucide/svelte/icons/zap';
	import Plug from '@lucide/svelte/icons/plug';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Check from '@lucide/svelte/icons/check';
	import Lock from '@lucide/svelte/icons/lock';
	import Puzzle from '@lucide/svelte/icons/puzzle';

	const steps = [
		{
			n: '01',
			icon: KeyRound,
			accent: 'mint',
			title: 'Encrypt locally',
			body: 'A fresh key is generated in your browser and encrypted with your identifier + password. Only the encrypted key is uploaded — never the key itself.'
		},
		{
			n: '02',
			icon: RefreshCw,
			accent: 'sun',
			title: 'Retrieve anywhere',
			body: 'Log in from any device with your identifier + password. The encrypted key is fetched and decrypted in a sealed-off part of your browser — it never touches the server, or this page.'
		},
		{
			n: '03',
			icon: ShieldCheck,
			accent: 'mint-deep',
			title: 'Sign without custody',
			body: "Hold the key for the session and sign, or let other apps ask this tab to sign for you. The server can't sign — and can't even name you."
		}
	];

	const trust = [
		{
			icon: ShieldCheck,
			title: "Server can't decrypt",
			body: 'Only an encrypted key is stored. Without your identifier + password it is useless — even to a fully-compromised server.'
		},
		{
			icon: Server,
			title: "Server can't name you",
			body: "No npub, no email, no metadata. Accounts are looked up by a scrambled, one-way version of your identifier. The server can't link you to your Nostr identity."
		},
		{
			icon: CloudOff,
			title: 'No custody',
			body: 'The server never sees your raw key or your raw password. It stores an encrypted key and a check value — nothing it could sign with, even if it wanted to.'
		},
		{
			icon: TriangleAlert,
			title: 'No recovery',
			body: 'Lose your identifier and password and the key is gone. That is the deliberate trade for non-custodial availability — stated plainly, up front.'
		}
	];
</script>

<svelte:head>
	<title>keys.justworks — your Nostr key, everywhere, held by no one</title>
</svelte:head>

<!-- Hero -->
<section class="mx-auto max-w-6xl px-4 pt-14 pb-10 sm:pt-20">
	<div class="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
		<div>
			<p class="text-xs font-bold tracking-[0.2em] text-mint-deep uppercase">
				Non-custodial Nostr key locker
			</p>
			<h1
				class="mt-4 text-4xl leading-[0.95] font-black tracking-tight text-balance sm:text-5xl lg:text-6xl"
			>
				Your Nostr key,<br />everywhere.<br /><span class="text-mint-deep">Held by no one.</span>
			</h1>
			<p class="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
				keys.justworks stores your encrypted key on a server that <strong
					class="font-semibold text-foreground">can't decrypt it</strong
				>
				and <strong class="font-semibold text-foreground">can't link it to your identity</strong>.
				Retrieve and sign from any device — no custody, no target.
			</p>
			<div class="mt-8 flex flex-wrap items-center gap-3">
				{#if keyholder.locked}
					<Button href="/get-started" size="lg">
						Get started
						<ArrowRight class="size-4" />
					</Button>
					<Button href="/login" variant="outline" size="lg">I already have a key</Button>
				{:else}
					<Button href="/app" size="lg">
						Go to dashboard
						<ArrowRight class="size-4" />
					</Button>
				{/if}
			</div>

			<!-- quick trust pills -->
			<div class="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
				<span class="inline-flex items-center gap-1.5"
					><Check class="size-4 text-mint-deep" />No custody</span
				>
				<span class="inline-flex items-center gap-1.5"
					><Check class="size-4 text-mint-deep" />Server can't decrypt</span
				>
				<span class="inline-flex items-center gap-1.5"
					><Check class="size-4 text-mint-deep" />Works on mobile</span
				>
			</div>
		</div>

		<!-- Locker mock card -->
		<div class="relative isolate lg:justify-self-end">
			<div class="absolute -inset-3 -z-10 rounded-3xl bg-mint/20 blur-2xl"></div>
			<div
				class="border-line w-full max-w-sm rounded-2xl border bg-paper-strong p-5 shadow-[0_24px_80px_var(--shadow)]"
			>
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2.5">
						<span
							class="inline-flex size-9 items-center justify-center rounded-lg bg-ink text-mint"
						>
							<KeyRound class="size-5" />
						</span>
						<div>
							<p class="text-sm leading-none font-bold">Your key</p>
							<p class="mt-1 font-mono text-[11px] text-quiet">ncryptsec1…</p>
						</div>
					</div>
					<Badge class="bg-mint/15 text-mint-deep">encrypted</Badge>
				</div>

				<div class="mt-4 rounded-lg bg-muted p-3">
					<code class="block font-mono text-xs break-all text-muted-foreground"
						>ncryptsec1pyar411111…••••••••••••••••••••••</code
					>
				</div>

				<div class="border-line mt-4 space-y-2.5 border-t pt-4 text-sm">
					<div class="flex items-center gap-2.5">
						<Server class="size-4 shrink-0 text-quiet" />
						<span class="text-muted-foreground">Server stores the encrypted key</span>
						<span
							class="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-mint-deep"
							><Lock class="size-3" />can't decrypt</span
						>
					</div>
					<div class="flex items-center gap-2.5">
						<Server class="size-4 shrink-0 text-quiet" />
						<span class="text-muted-foreground">No npub, no email</span>
						<span class="ml-auto text-xs font-semibold text-mint-deep">can't name you</span>
					</div>
					<div class="flex items-center gap-2.5">
						<Smartphone class="size-4 shrink-0 text-quiet" />
						<span class="text-muted-foreground">Your devices</span>
						<span class="ml-auto text-xs font-semibold text-mint-deep">decrypt + sign</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</section>

<!-- Problem -->
<section class="border-line border-y bg-paper-strong/50">
	<div class="mx-auto max-w-3xl px-4 py-16 text-center sm:py-20">
		<p class="text-xs font-bold tracking-[0.2em] text-sun uppercase">The problem</p>
		<p class="mt-5 text-2xl leading-snug font-bold text-balance sm:text-3xl">
			Nostr keys are hard to manage safely.
		</p>
		<p class="mt-5 text-lg leading-relaxed text-muted-foreground">
			Your identity is a key: lose it and your handle, follows, and reputation are gone. The easy
			ways to use it — paste it into apps, hand it to a signer, trust a plugin — all put your key
			somewhere it can be stolen. keys.justworks is the easy way that doesn't.
		</p>
	</div>
</section>

<!-- How it works -->
<section id="how" class="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:py-20">
	<div class="max-w-2xl">
		<p class="text-xs font-bold tracking-[0.2em] text-mint-deep uppercase">How it works</p>
		<h2 class="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Three steps. Zero custody.</h2>
	</div>
	<div class="mt-10 grid gap-5 md:grid-cols-3">
		{#each steps as step (step.n)}
			<div
				class="group border-line relative flex flex-col rounded-2xl border bg-paper-strong p-6 transition-transform hover:-translate-y-1"
			>
				<div class="flex items-center justify-between">
					<span
						class="inline-flex size-11 items-center justify-center rounded-xl bg-accent text-mint-deep"
					>
						<step.icon class="size-5" />
					</span>
					<span class="font-mono text-3xl font-black text-ink/10">{step.n}</span>
				</div>
				<h3 class="mt-5 text-lg font-bold">{step.title}</h3>
				<p class="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
			</div>
		{/each}
	</div>
</section>

<!-- Why trust it -->
<section class="border-line border-y bg-paper-strong/50">
	<div class="mx-auto max-w-6xl px-4 py-16 sm:py-20">
		<div class="max-w-2xl">
			<p class="text-xs font-bold tracking-[0.2em] text-mint-deep uppercase">
				Why you can trust it
			</p>
			<h2 class="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Designed to fail safe.</h2>
			<p class="mt-3 text-muted-foreground">
				Every guarantee is a property of the architecture, not a promise.
			</p>
		</div>
		<div class="mt-10 grid gap-5 sm:grid-cols-2">
			{#each trust as item (item.title)}
				<div class="border-line flex gap-4 rounded-2xl border bg-paper p-6">
					<span
						class="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-mint-deep"
					>
						<item.icon class="size-5" />
					</span>
					<div>
						<h3 class="font-bold">{item.title}</h3>
						<p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
					</div>
				</div>
			{/each}
		</div>
	</div>
</section>

<!-- Tools -->
<section class="mx-auto max-w-6xl px-4 py-16 sm:py-20">
	<div class="max-w-2xl">
		<p class="text-xs font-bold tracking-[0.2em] text-mint-deep uppercase">What you can do</p>
		<h2 class="mt-3 text-3xl font-black tracking-tight sm:text-4xl">One locker, three surfaces.</h2>
	</div>
	<div class="mt-10 grid gap-5 md:grid-cols-3">
		<a
			href="/get-started"
			class="border-line flex flex-col rounded-2xl border bg-paper-strong p-6 transition-transform hover:-translate-y-1"
		>
			<span class="inline-flex size-11 items-center justify-center rounded-xl bg-ink text-mint">
				<KeyRound class="size-5" />
			</span>
			<h3 class="mt-5 text-lg font-bold">The locker</h3>
			<p class="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
				Store your encrypted key once; retrieve and decrypt it from any device with your identifier
				and password.
			</p>
			<span class="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-mint-deep">
				Get started <ArrowRight class="size-4" />
			</span>
		</a>
		<a
			href="/app"
			class="border-line flex flex-col rounded-2xl border bg-paper-strong p-6 transition-transform hover:-translate-y-1"
		>
			<span
				class="inline-flex size-11 items-center justify-center rounded-xl bg-sun/20 text-[#8a5e10] dark:text-sun"
			>
				<Plug class="size-5" />
			</span>
			<h3 class="mt-5 text-lg font-bold">Remote signer</h3>
			<p class="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
				Let other Nostr apps sign through this browser tab. They send a request over a relay (a
				Nostr server) and you approve each one.
			</p>
			<span class="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-mint-deep">
				Open dashboard <ArrowRight class="size-4" />
			</span>
		</a>
		<div class="border-line flex flex-col rounded-2xl border border-dashed bg-paper-strong/50 p-6">
			<span
				class="inline-flex size-11 items-center justify-center rounded-xl bg-accent text-muted-foreground"
			>
				<Puzzle class="size-5" />
			</span>
			<h3 class="mt-5 text-lg font-bold">
				Browser extension <Badge variant="secondary" class="ml-1 align-middle">soon</Badge>
			</h3>
			<p class="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
				The strongest surface: your key stays walled off from the page, and it can sign for you on
				any Nostr site.
			</p>
		</div>
	</div>
</section>

<!-- Final CTA -->
<section class="mx-auto max-w-6xl px-4 pb-8">
	<div
		class="relative overflow-hidden rounded-3xl bg-ink px-6 py-14 text-center text-paper-strong sm:px-12"
	>
		<Zap class="mx-auto size-9 text-mint" />
		<h2 class="mt-4 text-3xl font-black tracking-tight text-balance sm:text-4xl">
			Take custody back — without the headaches.
		</h2>
		<p class="mx-auto mt-3 max-w-xl text-paper-strong/70">
			Generate a fresh key or import an existing one. Either way, the server only ever sees the
			encrypted key.
		</p>
		<div class="mt-8 flex flex-wrap justify-center gap-3">
			{#if keyholder.locked}
				<Button href="/get-started" size="lg" class="bg-mint text-ink hover:bg-mint/90">
					Create your key
					<ArrowRight class="size-4" />
				</Button>
			{:else}
				<Button href="/app" size="lg" class="bg-mint text-ink hover:bg-mint/90">
					Go to dashboard
				</Button>
			{/if}
		</div>
	</div>
</section>
