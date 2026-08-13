<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import { keyholder } from '$lib/keyholder/store.svelte';
	import Logo from '$lib/components/logo.svelte';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import LockOpen from '@lucide/svelte/icons/lock-open';
	import Lock from '@lucide/svelte/icons/lock';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import ExternalLink from '@lucide/svelte/icons/external-link';

	let { children } = $props();

	let menuOpen = $state(false);

	// Close the mobile menu whenever the route changes.
	$effect(() => {
		page.url.pathname;
		menuOpen = false;
	});

	function active(href: string): boolean {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}

	// Short npub for the header chip (first 16 chars of the bech32).
	const npubShort = $derived(keyholder.npub ? `${keyholder.npub.slice(0, 16)}…` : '');
</script>

<svelte:head>
	<title>keys.justworks — non-custodial Nostr key locker</title>
</svelte:head>

<div class="flex min-h-dvh flex-col">
	<!-- Header -->
	<header
		class="border-line sticky top-0 z-40 border-b bg-paper/80 backdrop-blur-md supports-[backdrop-filter]:bg-paper/65"
	>
		<div class="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
			<Logo />

			<!-- Desktop nav -->
			<nav class="hidden items-center gap-1.5 md:flex">
				{#if keyholder.locked}
					<a
						href="/#how"
						class="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>How it works</a
					>
					<Button href="/get-started" variant="ghost" size="sm">Get started</Button>
					<Button href="/login" size="sm">
						Unlock
						<ArrowRight class="size-4" />
					</Button>
				{:else}
					<a
						href="/app"
						class={cn(
							'border-line inline-flex items-center gap-1.5 rounded-lg border bg-paper-strong/70 px-2.5 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground',
							active('/app') && 'border-ink/30 text-foreground'
						)}
						title={keyholder.npub ?? ''}
					>
						<span class="size-1.5 rounded-full bg-mint"></span>
						{npubShort}
					</a>
					<Button href="/app" variant={active('/app') ? 'secondary' : 'ghost'} size="sm"
						>Dashboard</Button
					>
					<Button href="/bunker" variant={active('/bunker') ? 'secondary' : 'ghost'} size="sm"
						>Bunker</Button
					>
					<Button href="/login" onclick={() => keyholder.lock()} variant="outline" size="sm">
						<Lock class="size-4" />
						Lock
					</Button>
				{/if}
			</nav>

			<!-- Mobile: primary CTA + menu toggle -->
			<div class="flex items-center gap-2 md:hidden">
				{#if keyholder.locked}
					<Button href="/get-started" size="sm">Start</Button>
				{:else}
					<Button href="/app" size="sm">
						<LockOpen class="size-4" />
					</Button>
				{/if}
				<button
					type="button"
					class="border-line inline-flex size-9 items-center justify-center rounded-lg border bg-paper-strong/70 text-foreground"
					onclick={() => (menuOpen = !menuOpen)}
					aria-label={menuOpen ? 'Close menu' : 'Open menu'}
					aria-expanded={menuOpen}
				>
					{#if menuOpen}
						<X class="size-5" />
					{:else}
						<Menu class="size-5" />
					{/if}
				</button>
			</div>
		</div>

		<!-- Mobile panel -->
		{#if menuOpen}
			<nav class="border-line border-t bg-paper-strong px-4 py-3 md:hidden">
				<div class="flex flex-col gap-1">
					<a href="/" class="rounded-lg px-3 py-2.5 font-semibold hover:bg-accent">Home</a>
					<a href="/#how" class="rounded-lg px-3 py-2.5 font-semibold hover:bg-accent"
						>How it works</a
					>
					<a href="/get-started" class="rounded-lg px-3 py-2.5 font-semibold hover:bg-accent"
						>Get started</a
					>
					<a href="/login" class="rounded-lg px-3 py-2.5 font-semibold hover:bg-accent">Unlock</a>
					{#if !keyholder.locked}
						<a href="/app" class="rounded-lg px-3 py-2.5 font-semibold hover:bg-accent">Dashboard</a
						>
						<a href="/bunker" class="rounded-lg px-3 py-2.5 font-semibold hover:bg-accent">Bunker</a
						>
						<button
							type="button"
							onclick={() => keyholder.lock()}
							class="rounded-lg px-3 py-2.5 text-left font-semibold text-destructive hover:bg-accent"
							>Lock key</button
						>
					{/if}
				</div>
			</nav>
		{/if}
	</header>

	<main class="flex-1">
		{@render children()}
	</main>

	<!-- Footer -->
	<footer class="border-line mt-20 border-t bg-paper-strong/40">
		<div class="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
			<div class="sm:col-span-2 lg:col-span-2">
				<Logo size={30} />
				<p class="mt-3 max-w-sm text-sm text-muted-foreground">
					A non-custodial Nostr key locker. The server stores only an encrypted blob — it can't
					decrypt your key and can't link it to your identity.
				</p>
			</div>
			<div>
				<h3 class="text-xs font-bold tracking-wider text-quiet uppercase">Product</h3>
				<ul class="mt-3 flex flex-col gap-2 text-sm">
					<li>
						<a class="text-muted-foreground hover:text-foreground" href="/#how">How it works</a>
					</li>
					<li>
						<a class="text-muted-foreground hover:text-foreground" href="/get-started"
							>Get started</a
						>
					</li>
					<li><a class="text-muted-foreground hover:text-foreground" href="/login">Unlock</a></li>
					<li><a class="text-muted-foreground hover:text-foreground" href="/bunker">Bunker</a></li>
				</ul>
			</div>
			<div>
				<h3 class="text-xs font-bold tracking-wider text-quiet uppercase">Built on</h3>
				<ul class="mt-3 flex flex-col gap-2 text-sm">
					<li>
						<a
							class="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
							href="https://nips.nostr.com/7"
							target="_blank"
							rel="noopener noreferrer">NIP-07<ExternalLink class="size-3" /></a
						>
					</li>
					<li>
						<a
							class="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
							href="https://nips.nostr.com/46"
							target="_blank"
							rel="noopener noreferrer">NIP-46<ExternalLink class="size-3" /></a
						>
					</li>
					<li>
						<a
							class="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
							href="https://nips.nostr.com/49"
							target="_blank"
							rel="noopener noreferrer">NIP-49<ExternalLink class="size-3" /></a
						>
					</li>
				</ul>
			</div>
		</div>
		<div class="border-line border-t px-4 py-5 text-center text-xs text-quiet">
			No recovery by design · Self-hosted · Built on Nostr
		</div>
	</footer>
</div>
