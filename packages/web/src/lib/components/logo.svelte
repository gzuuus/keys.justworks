<script lang="ts">
	let {
		size = 30,
		wordmark = true,
		class: klass = ''
	}: { size?: number; wordmark?: boolean; class?: string } = $props();

	// The Checker Bow mark on its 6-unit cell grid: dithered checkerboard bow,
	// solid shaft, orange teeth. Chosen in the logo lab (static/logo-lab.html).
	const inkCells = [
		[6, 0],
		[18, 0],
		[0, 6],
		[12, 6],
		[24, 6],
		[6, 12],
		[18, 12],
		[0, 18],
		[12, 18],
		[24, 18],
		[6, 24],
		[18, 24],
		[30, 12],
		[36, 12],
		[42, 12],
		[48, 12],
		[54, 12]
	];
	const toothCells = [
		[42, 18],
		[54, 18],
		[54, 24]
	];
</script>

<a
	href="/"
	class="inline-flex items-center gap-2.5 text-foreground no-underline {klass}"
	aria-label="keys.justworks — home"
>
	<svg
		width={size * 2.03}
		height={size}
		viewBox="0 0 59 29"
		fill="none"
		class="shrink-0"
		aria-hidden="true"
	>
		{#each inkCells as [x, y] (x + '-' + y)}
			<rect {x} {y} width="5" height="5" fill="currentColor" />
		{/each}
		{#each toothCells as [x, y] (x + '-' + y)}
			<rect {x} {y} width="5" height="5" fill="var(--mint)" />
		{/each}
	</svg>
	{#if wordmark}
		<span class="font-display text-lg font-bold tracking-[-0.02em]">keys.justworks</span>
	{/if}
</a>
