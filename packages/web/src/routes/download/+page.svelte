<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import Download from '@lucide/svelte/icons/download';
	import Puzzle from '@lucide/svelte/icons/puzzle';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import ExternalLink from '@lucide/svelte/icons/external-link';

	// Live metadata from the served update.xml — the page always shows whatever
	// release this deployment has synced, with zero build coupling. Absent (dev
	// server, or artifacts not synced yet) → the fallback line covers it.
	let meta = $state<{ version: string; appid: string } | null>(null);

	$effect(() => {
		fetch('/extension/update.xml')
			.then((r) => (r.ok ? r.text() : Promise.reject(new Error('artifacts not served'))))
			.then((xml) => {
				const doc = new DOMParser().parseFromString(xml, 'application/xml');
				const version = doc.querySelector('updatecheck')?.getAttribute('version');
				const appid = doc.querySelector('app')?.getAttribute('appid');
				if (version) meta = { version, appid: appid ?? '' };
			})
			.catch(() => {
				/* not configured — fallback UI */
			});
	});
</script>

<svelte:head>
	<title>Browser extension — keys.justworks</title>
	<meta
		name="description"
		content="Install the keys.justworks NIP-07 signer extension for Chrome — non-custodial, auto-updating from this server."
	/>
</svelte:head>

<section class="mx-auto max-w-3xl px-4 pt-16 pb-20">
	<p class="text-xs font-bold tracking-[0.2em] text-mint-deep uppercase">Browser extension</p>
	<h1 class="text-ink mt-3 text-4xl font-black tracking-tight">A NIP-07 signer for every Nostr site.</h1>
	<p class="text-muted-foreground mt-4 max-w-xl text-lg leading-relaxed">
		Hold your key behind a permission prompt: sites ask, you approve, the extension signs. The key
		never touches the page — and the server still never sees it decrypted.
	</p>

	<div
		class="border-line mt-10 flex flex-col gap-6 rounded-2xl border bg-paper-strong p-6 sm:flex-row sm:items-center sm:justify-between"
	>
		<div>
			<h2 class="text-ink text-lg font-bold">keys.justworks.crx</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				{#if meta}
					Version {meta.version} — updates automatically from this server
				{:else}
					Self-hosted build; also on GitHub releases
				{/if}
			</p>
		</div>
		<Button href="/extension/keys-justworks.crx" size="lg" class="bg-mint text-ink hover:bg-mint/90">
			<Download class="size-4" />
			Download .crx
		</Button>
	</div>

	<div class="mt-12 grid gap-8 sm:grid-cols-3">
		<div>
			<span class="bg-accent inline-flex size-10 items-center justify-center rounded-xl">
				<Download class="text-ink size-5" />
			</span>
			<h3 class="mt-3 font-bold">1 · Download</h3>
			<p class="text-muted-foreground mt-1 text-sm leading-relaxed">
				Grab the <code>.crx</code> from this server (button above) or the GitHub release.
			</p>
		</div>
		<div>
			<span class="bg-accent inline-flex size-10 items-center justify-center rounded-xl">
				<Puzzle class="text-ink size-5" />
			</span>
			<h3 class="mt-3 font-bold">2 · Install</h3>
			<p class="text-muted-foreground mt-1 text-sm leading-relaxed">
				Open <code>chrome://extensions</code>, turn on <strong>Developer mode</strong>, and drag
				the file onto the page.
			</p>
		</div>
		<div>
			<span class="bg-accent inline-flex size-10 items-center justify-center rounded-xl">
				<ShieldCheck class="text-ink size-5" />
			</span>
			<h3 class="mt-3 font-bold">3 · Approve sites</h3>
			<p class="text-muted-foreground mt-1 text-sm leading-relaxed">
				Sites ask to read your key or sign for you; you approve each request — or remember the
				choice per site.
			</p>
		</div>
	</div>

	<div class="border-line mt-12 rounded-2xl border p-6">
		<h2 class="flex items-center gap-2 font-bold">
			<RefreshCw class="text-mint-deep size-4" /> Updates without the Web Store
		</h2>
		<p class="text-muted-foreground mt-2 text-sm leading-relaxed">
			Once installed from the <code>.crx</code>, the extension updates itself: Chrome checks this
			server every few hours and pulls the new build when the version bumps. No account, no store.
			(Beta software — not on the Chrome Web Store yet.)
		</p>
		{#if meta?.appid}
			<p class="text-muted-foreground mt-3 font-mono text-xs break-all">
				extension id: {meta.appid}
			</p>
		{/if}
	</div>

	<a
		href="https://github.com/gzuuus/keys.justworks/releases"
		class="text-muted-foreground mt-6 inline-flex items-center gap-1 text-sm hover:text-foreground"
	>
		<ExternalLink class="size-4" /> Source &amp; releases on GitHub
	</a>
</section>
