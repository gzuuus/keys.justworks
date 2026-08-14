<script lang="ts">
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import { ProfileModel } from 'applesauce-core/models';
	import { ensureProfile, eventStore, hexColor, npubToHex, shortNpub } from '$lib/profiles';

	/** Avatar + display name for a pubkey (npub), falling back to a colored
	 *  initial + short npub until (or unless) a kind 0 arrives. */
	let { npub, size = 'sm' }: { npub: string; size?: 'xs' | 'sm' | 'md' } = $props();

	const hex = $derived(npubToHex(npub));
	let profile = $state<{
		name?: string;
		display_name?: string;
		picture?: string;
		nip05?: string;
	} | null>(null);

	$effect(() => {
		if (!hex) return;
		profile = null;
		const model = eventStore.model(ProfileModel, hex);
		const sub = model.subscribe((p) => (profile = p ?? null));
		const fetchSub = ensureProfile(hex);
		return () => {
			sub.unsubscribe();
			fetchSub?.unsubscribe();
		};
	});

	const name = $derived(
		profile?.name?.trim() || profile?.display_name?.trim() || shortNpub(npub)
	);
	// kind 0 content is attacker-controlled JSON — only https images, no referrer.
	const img = $derived(
		profile?.picture?.startsWith('https://') ? profile.picture : null
	);
</script>

<div class="flex min-w-0 items-center {size === 'xs' ? 'gap-1.5' : 'gap-2.5'}">
	<Avatar class={size === 'md' ? 'size-12' : size === 'xs' ? 'size-6' : 'size-8'}>
		{#if img}
			<AvatarImage src={img} alt={name} loading="lazy" referrerpolicy="no-referrer" />
		{/if}
		<AvatarFallback
			style="background-color: {hexColor(hex ?? npub)}"
			class={size === 'xs' ? 'text-[0.65rem]' : 'text-xs'} font-semibold text-white
		>
			{name.slice(0, 1).toUpperCase()}
		</AvatarFallback>
	</Avatar>
	<span class="truncate {size === 'xs' ? 'text-xs' : 'text-sm'} font-medium">{name}</span>
</div>
