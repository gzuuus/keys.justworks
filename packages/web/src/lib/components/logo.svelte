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
		class="shrink-0 drop-shadow-sm"
		aria-hidden="true"
	>
		<rect width="32" height="32" rx="8" fill="#101413" />
		<circle cx="10" cy="16" r="4.4" fill="none" stroke="#61cdbb" stroke-width="2.5" />
		<path d="M14.5 16H26" stroke="#61cdbb" stroke-width="2.5" stroke-linecap="round" />
		<path d="M20 16v4M24 16v3" stroke="#61cdbb" stroke-width="2.5" stroke-linecap="round" />
	</svg>
	{#if wordmark}
		<span class="text-lg font-black tracking-tight"
			>keys<span class="text-mint-deep">.</span>justworks</span
		>
	{/if}
</a>
