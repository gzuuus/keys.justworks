<script lang="ts">
	// Same mark as packages/web's logo.svelte (ink rounded square + mint key).
	// Duplicated across surfaces like the CSS palette tokens — it's static brand
	// markup; if the logo changes, change both.
	let {
		size = 34,
		wordmark = true
	}: { size?: number; wordmark?: boolean } = $props();
</script>

<span class="inline" style="font-size:{size / 34}rem" aria-label="keys.justworks">
	<svg
		width={size}
		height={size}
		viewBox="0 0 32 32"
		fill="none"
		aria-hidden="true"
		style="vertical-align: middle"
	>
		<rect width="32" height="32" rx="8" fill="var(--ink)" />
		<circle cx="10" cy="16" r="4.4" fill="none" stroke="var(--mint)" stroke-width="2.5" />
		<path d="M14.5 16H26" stroke="var(--mint)" stroke-width="2.5" stroke-linecap="round" />
		<path d="M20 16v4M24 16v3" stroke="var(--mint)" stroke-width="2.5" stroke-linecap="round" />
	</svg>
	{#if wordmark}
		<span class="wordmark">keys<span class="dot">.</span>justworks</span>
	{/if}
</span>

<style>
	.inline {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
	}
	.wordmark {
		font-size: 1.2rem;
		font-weight: 900;
		letter-spacing: -0.02em;
		color: var(--ink);
		white-space: nowrap;
	}
	.dot {
		color: var(--mint-deep);
	}
</style>
