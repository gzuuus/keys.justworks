<!--
	keys.justworks — lazy NIP-46 bunker runtime mount.

	Owns the keyholder → bunker lifecycle that the root layout used to wire
	directly. The bunker stack (applesauce-relay/signers, nostr-tools) is only
	ever needed once a key is unlocked, so it is imported on first unlock — a
	locked visitor (the marketing pages) never downloads it. The global approval
	dialog ships with it: a connected client can be approved from any page.

	Transition-driven like the layout effect it replaces: reads of keyholder
	state inside the async `start()` are outside reactive tracking on purpose —
	they re-check the live state rather than trusting the value that scheduled
	the load, and never write back into it.
-->
<script lang="ts">
	import { keyholder } from '$lib/keyholder/store.svelte';

	type BunkerModule = typeof import('$lib/bunker/bunkers.svelte');
	type AppsModule = typeof import('$lib/bunker/apps.svelte');
	type ApprovalDialog = typeof import('$lib/components/approval-dialog.svelte').default;

	let bunker: BunkerModule | null = null;
	let apps: AppsModule | null = null;
	let Dialog = $state<ApprovalDialog | null>(null);

	$effect(() => {
		const target: string | null = keyholder.locked || !keyholder.npub ? null : keyholder.npub;
		if (!target) {
			// Lock: stop the runtime but keep it resident — the chunk is cached
			// and the persisted app records outlive the key session.
			apps?.bunkerApps.setOwner(null);
			bunker?.bunker.stopAll();
			return;
		}
		const start = () => {
			if (!bunker || !apps || keyholder.locked || !keyholder.npub) return;
			apps.bunkerApps.setOwner(keyholder.npub);
			void bunker.bunker.startAll();
		};
		if (bunker && apps) {
			start();
		} else {
			// First unlock: fetch the runtime + dialog in parallel, then start.
			void Promise.all([
				import('$lib/bunker/bunkers.svelte'),
				import('$lib/bunker/apps.svelte'),
				import('$lib/components/approval-dialog.svelte')
			])
				.then(([mod, appsMod, dialog]) => {
					bunker = mod;
					apps = appsMod;
					Dialog = dialog.default;
					start();
				})
				.catch(() => {
					// Chunk fetch failed (e.g. offline first unlock); the next unlock retries.
				});
		}
	});
</script>

{#if Dialog}<Dialog />{/if}
