<script lang="ts">
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import { hexColor, shortNpub } from '$lib/profiles';

	/** Avatar + display name for a pubkey (npub), falling back to a colored
	 *  initial + short npub until (or unless) a kind 0 arrives. */
	let { npub, size = 'sm' }: { npub: string; size?: 'xs' | 'sm' | 'md' } = $props();

	// The npub→hex decode and the EventStore + relay machinery (nostr-tools,
	// applesauce) are imported on demand — this chip renders in the root
	// layout's header, and nostr-tools' noble-hashes chain must stay out of
	// the locked/marketing initial download. Until the chunk lands the short
	// npub fallback below is shown; enrichment is cosmetic anyway.
	let hex = $state<string | null>(null);
	let profile = $state<{
		name?: string;
		display_name?: string;
		picture?: string;
		nip05?: string;
	} | null>(null);

	$effect(() => {
		if (!npub) return;
		hex = null;
		profile = null;
		let closed = false;
		let unsubscribe: (() => void) | null = null;
		void import('$lib/profiles-store')
			.then(({ npubToHex, subscribeProfile }) => {
				if (closed) return;
				hex = npubToHex(npub);
				if (hex) unsubscribe = subscribeProfile(hex, (p) => (profile = p ?? null));
			})
			.catch(() => {
				// best-effort enrichment — the npub fallback stays
			});
		return () => {
			closed = true;
			unsubscribe?.();
		};
	});

	const name = $derived(profile?.name?.trim() || profile?.display_name?.trim() || shortNpub(npub));
	// kind 0 content is attacker-controlled JSON — only https images, no referrer.
	const img = $derived(profile?.picture?.startsWith('https://') ? profile.picture : null);
</script>

<div class="flex min-w-0 items-center {size === 'xs' ? 'gap-1.5' : 'gap-2.5'}">
	<Avatar class={size === 'md' ? 'size-12' : size === 'xs' ? 'size-6' : 'size-8'}>
		{#if img}
			<AvatarImage src={img} alt={name} loading="lazy" referrerpolicy="no-referrer" />
		{/if}
		<AvatarFallback
			style="background-color: {hexColor(hex ?? npub)}"
			class="font-semibold text-white {size === 'xs' ? 'text-[0.65rem]' : 'text-xs'}"
		>
			{name.slice(0, 1).toUpperCase()}
		</AvatarFallback>
	</Avatar>
	<span class="truncate {size === 'xs' ? 'text-xs' : 'text-sm'} font-medium">{name}</span>
</div>
