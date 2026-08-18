<script lang="ts">
	import KeyBlade from '$lib/components/key-blade.svelte';
	import RubberFob from '$lib/components/rubber-fob.svelte';

	let { class: className = '' }: { class?: string } = $props();
</script>

<svg
	class={`hero-key ${className}`}
	viewBox="-138 -128 286 568"
	fill="none"
	aria-hidden="true"
	focusable="false"
>
	<KeyBlade prefix="hero" />

	<g class="hero-key__fob-light" transform="scale(1.105)">
		<RubberFob prefix="hero-fob-light" tone="orange" socket={true} depthX={3.2} depthY={4.5} />
	</g>
	<g class="hero-key__fob-dark" transform="scale(1.105)">
		<RubberFob prefix="hero-fob-dark" tone="black" socket={true} depthX={3.2} depthY={4.5} />
	</g>
	<image
		class="hero-key__nostr-shadow"
		href="/key-mark.svg"
		x="-48"
		y="-37"
		width="92"
		height="92"
		opacity="0.7"
	/>
	<image
		class="hero-key__nostr-mark"
		href="/key-mark.svg"
		x="-47"
		y="-39"
		width="92"
		height="92"
		opacity="0.9"
	/>
</svg>

<style>
	.hero-key {
		--key-metal-0: #fafafa;
		--key-metal-1: #e4e4e7;
		--key-metal-2: #8f9298;
		--key-metal-3: #f4f4f5;
		--key-metal-4: #4b4d52;
		--key-depth-0: #a1a1aa;
		--key-depth-1: #52525b;
		--key-depth-2: #18181b;
		--key-edge-light: #fafafa;
		--key-edge-shade: #5f6368;
		--key-groove-light: #fafafa;
		--key-groove-shadow: #59606a;
		--key-groove-core: #252a31;
		--fob-shell-0: #f0871a;
		--fob-shell-1: #ce5700;
		--fob-shell-mid: #a93400;
		--fob-shell-2: #6f1b00;
		--fob-inset-0: #dd6908;
		--fob-inset-1: #b83e00;
		--fob-inset-2: #731b00;
		--fob-fluid-light: #ffc178;
		--fob-fluid-shade: #3f0c00;
		--fob-fluid-sheen: #ffb45b;
		--fob-fluid-sheen-opacity: 0.2;
		--fob-inset-light: #ff9d38;
		--fob-shadow: #681900;
		--fob-shadow-width: 0;
		--fob-inset-stroke: #8a2600;
		--fob-inset-width: 0;
		--fob-outline: #681900;
		--fob-outline-width: 0.4;
		--hero-nostr-filter: brightness(0) drop-shadow(0 1.2px 0 rgb(255 214 160 / 0.38));
	}
	.hero-key__fob-light {
		display: block;
	}
	.hero-key__fob-dark {
		display: none;
	}
	.hero-key__nostr-shadow {
		filter: brightness(0);
	}
	.hero-key__nostr-mark {
		filter: var(--hero-nostr-filter);
	}
	:global(.dark) .hero-key {
		--key-metal-0: #ffd08a;
		--key-metal-1: #f7931a;
		--key-metal-2: #c85f00;
		--key-metal-3: #ffad42;
		--key-metal-4: #672600;
		--key-depth-0: #8f3c00;
		--key-depth-1: #4b1c00;
		--key-depth-2: #220b00;
		--key-edge-light: #e47a08;
		--key-edge-shade: #7b2c00;
		--key-groove-light: #ffbd65;
		--key-groove-shadow: #713000;
		--key-groove-core: #421500;
		--fob-shell-0: #181818;
		--fob-shell-1: #0a0a0a;
		--fob-shell-mid: #070707;
		--fob-shell-2: #030303;
		--fob-inset-0: #181818;
		--fob-inset-1: #0a0a0a;
		--fob-inset-2: #030303;
		--fob-shadow: #020202;
		--fob-shadow-width: 3.5;
		--fob-inset-stroke: #030303;
		--fob-inset-width: 4;
		--fob-outline: #050505;
		--fob-outline-width: 2.4;
		--fob-seam: #050505;
		--fob-seam-opacity: 0.34;
		--fob-gloss-opacity: 0.16;
		--fob-shell-gloss-opacity: 0.1;
		--hero-nostr-filter: brightness(0) invert(1) drop-shadow(0 1.4px 1px rgb(0 0 0 / 0.92));
	}
	:global(.dark) .hero-key__fob-light {
		display: none;
	}
	:global(.dark) .hero-key__fob-dark {
		display: block;
	}
</style>
