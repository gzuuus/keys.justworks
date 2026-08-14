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
		width={size}
		height={size}
		viewBox="0 0 32 32"
		fill="none"
		class="shrink-0"
		aria-hidden="true"
	>
		<circle cx="8" cy="16" r="5" stroke="currentColor" stroke-width="2.4" />
		<path d="M13 16H28" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" />
		<path d="M21 16v5M26 16v3.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" />
	</svg>
	{#if wordmark}
		<span class="font-display text-lg font-bold tracking-[-0.02em]">keys.justworks</span>
	{/if}
</a>
