<script lang="ts">
	import './layout.css';
	import { dev } from '$app/environment';
	import { page } from '$app/state';
	import { keyholder } from '$lib/keyholder/store.svelte';
	import Logo from '$lib/components/logo.svelte';
	import { Button } from '$lib/components/ui/button';
	import ThemeToggle from '$lib/components/theme-toggle.svelte';
	import { ModeWatcher } from 'mode-watcher';
	import { cn } from '$lib/utils';
	import Menu from '@lucide/svelte/icons/menu';
	import GithubMark from '$lib/components/github-mark.svelte';
	import X from '@lucide/svelte/icons/x';
	import Lock from '@lucide/svelte/icons/lock';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import { bunker } from '$lib/bunker/bunkers.svelte';
	import { bunkerApps } from '$lib/bunker/apps.svelte';
	import ApprovalDialog from '$lib/components/approval-dialog.svelte';
	import ProfileChip from '$lib/components/profile-chip.svelte';

	let { children } = $props();

	let menuOpen = $state(false);
	const mobileMenuItemClass =
		'border-b border-foreground/20 py-4 font-display text-2xl font-semibold [@media(max-height:700px)]:py-2.5 [@media(max-height:700px)]:text-xl';

	// Close the mobile menu whenever the route changes.
	$effect(() => {
		page.url.pathname;
		menuOpen = false;
	});

	function active(href: string): boolean {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}

	function replayIntro() {
		sessionStorage.removeItem('keys.justworks:intro-seen');
		window.location.assign('/');
	}

	// Drive the bunker runtime from the keyholder lifecycle: start (reconnect
	// persisted slots) on unlock, stop everything on lock. Transition-guarded —
	// `bunkerOwner` is a plain non-reactive var so the effect only acts on a real
	// lock/unlock change and can never feed back into itself. The approval dialog
	// renders globally below, so a connected client can be approved from any page.
	let bunkerOwner: string | null | undefined = undefined;
	$effect(() => {
		const target: string | null = keyholder.locked || !keyholder.npub ? null : keyholder.npub;
		if (target === bunkerOwner) return;
		bunkerOwner = target;
		if (target) {
			bunkerApps.setOwner(target);
			void bunker.startAll();
		} else {
			bunkerApps.setOwner(null);
			void bunker.stopAll();
		}
	});
</script>

<svelte:head>
	<title>keys.justworks — non-custodial Nostr key locker</title>
</svelte:head>

<ModeWatcher defaultMode="dark" />

<div class="flex min-h-dvh flex-col">
	<!-- Header -->
	<header
		class="sticky top-0 z-40 border-b-0 border-border bg-[#FAFAFA] [--control-height:var(--nav-control-height)] md:border-b dark:bg-[#0A0A0A]"
	>
		<div
			class="mx-auto flex h-16 w-full max-w-none items-center justify-between gap-4 px-6 sm:px-10 lg:px-[clamp(2.5rem,5vw,5.5rem)]"
		>
			<div class="flex items-center gap-2">
				<Logo wordmark={false} />
				{#if dev}
					<button
						type="button"
						class="inline-flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						onclick={replayIntro}
						aria-label="Replay intro"
						title="Replay intro (development only)"
					>
						<RotateCcw class="size-4" />
					</button>
				{/if}
			</div>

			<!-- Desktop nav -->
			<nav class="hidden items-center gap-1.5 md:flex">
				<a
					href="/docs"
					class={cn(
						'rounded-lg px-3 py-2 text-sm font-semibold transition-colors hover:bg-accent hover:text-foreground',
						active('/docs') ? 'text-foreground' : 'text-muted-foreground'
					)}>Docs</a
				>
				<a
					href="/download"
					class={cn(
						'rounded-lg px-3 py-2 text-sm font-semibold transition-colors hover:bg-accent hover:text-foreground',
						active('/download') ? 'text-foreground' : 'text-muted-foreground'
					)}>Extension</a
				>
				{#if keyholder.locked}
					<Button href="/get-started" variant="ghost" size="sm">Get started</Button>
					<Button href="/login" size="sm">
						Account
						<ArrowRight class="size-4" />
					</Button>
				{:else}
					<a
						href="/app"
						class={cn(
							'border-line inline-flex items-center gap-2 rounded-lg border bg-paper-strong/70 px-2 py-1 text-muted-foreground transition-colors hover:text-foreground',
							active('/app') && 'border-ink/30 text-foreground'
						)}
						title={keyholder.npub ?? ''}
					>
						<span class="size-1.5 shrink-0 rounded-full bg-mint"></span>
						<ProfileChip npub={keyholder.npub!} size="xs" />
					</a>
					<Button href="/app" variant={active('/app') ? 'secondary' : 'ghost'} size="sm"
						>Dashboard</Button
					>
					<Button href="/login" onclick={() => keyholder.lock()} variant="outline" size="sm">
						<Lock class="size-4" />
						Lock
					</Button>
				{/if}
				<Button
					href="https://github.com/gzuuus/keys.justworks"
					target="_blank"
					rel="noopener noreferrer"
					variant="ghost"
					size="icon"
				>
					<GithubMark class="size-4" />
					<span class="sr-only">Source on GitHub</span>
				</Button>
				<ThemeToggle />
			</nav>

			<!-- Mobile header stays intentionally quiet; navigation floats below. -->
			<div class="md:hidden">
				<ThemeToggle />
			</div>
		</div>
	</header>

	{#if menuOpen}
		<div
			class="fixed top-16 right-0 bottom-0 left-0 z-30 flex flex-col bg-paper px-6 py-6 text-foreground md:hidden [@media(max-height:700px)]:py-3"
		>
			<nav
				class="my-auto flex flex-col border-t border-foreground/20"
				aria-label="Mobile navigation"
			>
				<a class={mobileMenuItemClass} href="/">Home</a>
				<a class={mobileMenuItemClass} href="/docs">Docs</a>
				<a class={mobileMenuItemClass} href="/download">Extension</a>
				<a class={mobileMenuItemClass} href="/get-started">Get started</a>
				<a class={mobileMenuItemClass} href="/login">Account</a>
				<a
					class={mobileMenuItemClass}
					href="https://github.com/gzuuus/keys.justworks"
					target="_blank"
					rel="noopener noreferrer">Source on GitHub</a
				>
				{#if !keyholder.locked}
					<a class={mobileMenuItemClass} href="/app">Dashboard</a>
					<button
						type="button"
						onclick={() => keyholder.lock()}
						class={cn(mobileMenuItemClass, 'text-left text-destructive')}>Lock key</button
					>
				{/if}
			</nav>
			<Button
				variant="default"
				size="icon-lg"
				class="fixed right-5 bottom-[max(1.25rem,env(safe-area-inset-bottom))] size-14"
				onclick={() => (menuOpen = false)}
				aria-label="Close menu"
			>
				<X class="size-5" />
			</Button>
		</div>
	{:else}
		<Button
			variant="default"
			size="icon-lg"
			class="fixed right-5 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-50 size-14 shadow-lg md:hidden"
			onclick={() => (menuOpen = true)}
			aria-label="Open menu"
			aria-expanded="false"
		>
			<Menu class="size-5" />
		</Button>
	{/if}

	<main class="flex-1">
		{@render children()}
	</main>

	<!-- Footer -->
	{#if !['/', '/login', '/get-started'].includes(page.url.pathname)}
		<footer class="border-line mt-20 border-t bg-paper-strong/40">
			<div class="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
				<div class="sm:col-span-2 lg:col-span-2">
					<Logo size={30} />
					<p class="mt-3 max-w-sm text-sm text-muted-foreground">
						A non-custodial Nostr key locker. The server stores only an encrypted key — it can't
						decrypt your key and can't link it to your identity.
					</p>
				</div>
				<div>
					<h3 class="text-xs font-bold tracking-wider text-quiet uppercase">Product</h3>
					<ul class="mt-3 flex flex-col gap-2 text-sm">
						<li>
							<a class="text-muted-foreground hover:text-foreground" href="/get-started"
								>Get started</a
							>
						</li>
						<li><a class="text-muted-foreground hover:text-foreground" href="/login">Unlock</a></li>
						<li>
							<a class="text-muted-foreground hover:text-foreground" href="/docs"
								>API &amp; integration</a
							>
						</li>
						<li>
							<a class="text-muted-foreground hover:text-foreground" href="/download">Extension</a>
						</li>
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
				No recovery by design · Self-hosted · Built on Nostr · MIT ·
				<a
					class="inline-flex items-center gap-1 hover:text-foreground"
					href="https://github.com/gzuuus/keys.justworks"
					target="_blank"
					rel="noopener noreferrer">GitHub</a
				>
			</div>
		</footer>
	{/if}

	<!-- Global NIP-46 approval dialog (renders on any page when unlocked). -->
	<ApprovalDialog />
</div>
