<script lang="ts">
	let {
		size = 34,
		wordmark = true,
		class: klass = ''
	}: { size?: number; wordmark?: boolean; class?: string } = $props();
</script>

<a
	href="/"
	class="inline-flex items-center gap-2.5 text-foreground no-underline {klass}"
	aria-label="keys.justworks — home"
>
	<svg
		width={size * 1.5}
		height={size}
		viewBox="0 0 84 50"
		fill="none"
		class="shrink-0"
		aria-hidden="true"
	>
		<path
			fill="currentColor"
			transform="translate(0 -12)"
			d="M5 55V19h12l25 22V19h12v11h24v8H54v7h24v8H54v2H42L17 33v22Z"
		/>
		<path fill="var(--mint)" transform="translate(0 -12)" d="M17 19h9l16 14v10L17 21Z" />
	</svg>
	{#if wordmark}
		<span class="font-display text-lg font-bold tracking-[-0.02em]">keys.justworks</span>
	{/if}
</a>
