<script lang="ts">
	import RubberFob from '$lib/components/rubber-fob.svelte';

	let { class: className = '' }: { class?: string } = $props();
	// One-switch experiment: set false to restore only the black fob's flat finish.
	const kammergutBlackPaintGlossEnabled = true;
	// One-switch experiment: set false to restore the flat Nostr mark treatment.
	const embossedNostrEnabled = true;
</script>

<svg
	class={`hero-key ${className}`}
	viewBox="-138 -128 286 568"
	fill="none"
	aria-hidden="true"
	focusable="false"
>
	<defs>
		<linearGradient id="hero-key-metal" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="var(--hero-metal-0)" />
			<stop offset="0.18" stop-color="var(--hero-metal-1)" />
			<stop offset="0.48" stop-color="var(--hero-metal-2)" />
			<stop offset="0.72" stop-color="var(--hero-metal-3)" />
			<stop offset="1" stop-color="var(--hero-metal-4)" />
		</linearGradient>
		<linearGradient id="hero-key-depth" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="var(--hero-depth-0)" />
			<stop offset="0.5" stop-color="var(--hero-depth-1)" />
			<stop offset="1" stop-color="var(--hero-depth-2)" />
		</linearGradient>
		<linearGradient id="hero-key-sheen" x1="0" y1="0" x2="1" y2="0">
			<stop offset="0" stop-color="#FAFAFA" stop-opacity="0" />
			<stop offset="0.44" stop-color="#FAFAFA" stop-opacity="0" />
			<stop offset="0.52" stop-color="#FAFAFA" stop-opacity="0.5" />
			<stop offset="0.61" stop-color="#FAFAFA" stop-opacity="0" />
			<stop offset="1" stop-color="#FAFAFA" stop-opacity="0" />
		</linearGradient>
		<linearGradient id="hero-keyway-recess" x1="0" y1="0" x2="1" y2="0">
			<stop offset="0" stop-color="var(--hero-groove-light)" stop-opacity="0.64" />
			<stop offset="0.16" stop-color="var(--hero-groove-core)" stop-opacity="0.58" />
			<stop offset="0.7" stop-color="var(--hero-groove-shadow)" stop-opacity="0.88" />
			<stop offset="1" stop-color="var(--hero-groove-core)" stop-opacity="0.36" />
		</linearGradient>
		<linearGradient id="hero-fob-light-backing" x1="0" y1="0" x2="0.85" y2="1">
			<stop offset="0" stop-color="#b83f00" />
			<stop offset="0.48" stop-color="#651a00" />
			<stop offset="0.76" stop-color="#cf5000" />
			<stop offset="1" stop-color="#451000" />
		</linearGradient>
		<linearGradient id="hero-fob-dark-backing" x1="0" y1="0" x2="0.85" y2="1">
			<stop offset="0" stop-color="#191919" />
			<stop offset="0.48" stop-color="#030303" />
			<stop offset="0.76" stop-color="#101010" />
			<stop offset="1" stop-color="#000000" />
		</linearGradient>
		<filter id="hero-key-invert" color-interpolation-filters="sRGB">
			<feComponentTransfer>
				<feFuncR type="table" tableValues="1 0" />
				<feFuncG type="table" tableValues="1 0" />
				<feFuncB type="table" tableValues="1 0" />
				<feFuncA type="identity" />
			</feComponentTransfer>
		</filter>
		<filter id="hero-key-metal-texture" x="-16%" y="-12%" width="132%" height="124%">
			<feTurbulence
				type="fractalNoise"
				baseFrequency="0.62 0.012"
				numOctaves="2"
				seed="14"
				result="brush"
			/>
			<feColorMatrix
				in="brush"
				type="matrix"
				values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .12 0"
				result="soft-brush"
			/>
			<feComposite in="soft-brush" in2="SourceAlpha" operator="in" result="clipped-brush" />
			<feBlend in="SourceGraphic" in2="clipped-brush" mode="soft-light" />
		</filter>
		<filter id="hero-key-edge-finish" x="-8%" y="-5%" width="116%" height="112%">
			<feMorphology in="SourceAlpha" operator="erode" radius="1.35" result="inner" />
			<feComposite in="SourceAlpha" in2="inner" operator="out" result="edge" />
			<feGaussianBlur in="edge" stdDeviation="0.45" result="soft-edge" />
			<feFlood flood-color="var(--hero-edge-light)" flood-opacity="0.62" result="light-color" />
			<feComposite in="light-color" in2="soft-edge" operator="in" result="edge-light" />
			<feOffset in="edge-light" dx="-0.8" dy="-0.8" result="top-light" />
			<feFlood flood-color="var(--hero-edge-shade)" flood-opacity="0.55" result="shade-color" />
			<feComposite in="shade-color" in2="soft-edge" operator="in" result="edge-shade" />
			<feOffset in="edge-shade" dx="0.9" dy="1" result="bottom-shade" />
			<feMerge>
				<feMergeNode in="bottom-shade" />
				<feMergeNode in="SourceGraphic" />
				<feMergeNode in="top-light" />
			</feMerge>
		</filter>
		<filter id="hero-key-rubber-texture" x="-15%" y="-15%" width="130%" height="130%">
			<feTurbulence
				type="fractalNoise"
				baseFrequency="0.025 0.34"
				numOctaves="2"
				seed="8"
				result="grain"
			/>
			<feColorMatrix
				in="grain"
				type="matrix"
				values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .05 0"
				result="soft-grain"
			/>
			<feComposite in="soft-grain" in2="SourceAlpha" operator="in" result="clipped-grain" />
			<feBlend in="SourceGraphic" in2="clipped-grain" mode="multiply" />
		</filter>
		<filter id="hero-key-rubber" x="-18%" y="-18%" width="136%" height="142%">
			<feTurbulence
				type="fractalNoise"
				baseFrequency="0.032 0.28"
				numOctaves="2"
				seed="11"
				result="grain"
			/>
			<feColorMatrix
				in="grain"
				type="matrix"
				values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .032 0"
				result="soft-grain"
			/>
			<feComposite in="soft-grain" in2="SourceAlpha" operator="in" result="clipped-grain" />
			<feBlend in="SourceGraphic" in2="clipped-grain" mode="screen" result="painted" />
			<feGaussianBlur in="SourceAlpha" stdDeviation="1.05" result="bump" />
			<feSpecularLighting
				in="bump"
				surfaceScale="3.2"
				specularConstant="0.78"
				specularExponent="46"
				lighting-color="#FAFAFA"
				result="spec"
			>
				<fePointLight x="-180" y="-260" z="300" />
			</feSpecularLighting>
			<feComposite in="spec" in2="SourceAlpha" operator="in" result="spec-clip" />
			<feGaussianBlur in="SourceAlpha" stdDeviation="2.4" result="shadow-blur" />
			<feOffset in="shadow-blur" dx="1.5" dy="3" result="shadow-offset" />
			<feComponentTransfer in="shadow-offset" result="shadow">
				<feFuncA type="linear" slope="0.42" />
			</feComponentTransfer>
			<feMerge>
				<feMergeNode in="shadow" />
				<feMergeNode in="painted" />
				<feMergeNode in="spec-clip" />
			</feMerge>
		</filter>
		<mask
			id="hero-key-shape"
			x="-130"
			y="-130"
			width="260"
			height="550"
			maskUnits="userSpaceOnUse"
			style="mask-type: luminance"
		>
			<g transform="rotate(-90)">
				<image
					href="/key-silhouette.png"
					x="-396"
					y="-105"
					width="500"
					height="210"
					filter="url(#hero-key-invert)"
				/>
			</g>
		</mask>
	</defs>

	{#each [10, 8, 6, 4, 2] as depth}
		<rect
			x="-120"
			y="-120"
			width="240"
			height="540"
			fill="url(#hero-key-depth)"
			mask="url(#hero-key-shape)"
			transform={`translate(${depth * 0.9} ${depth * 1.2})`}
		/>
	{/each}
	<g filter="url(#hero-key-edge-finish)">
		<g mask="url(#hero-key-shape)">
			<rect
				x="-120"
				y="-120"
				width="240"
				height="540"
				fill="url(#hero-key-metal)"
				filter="url(#hero-key-metal-texture)"
			/>
			<rect x="-148" y="-120" width="240" height="540" fill="url(#hero-key-sheen)" opacity="0.24" />
			<g data-keyway-grooves stroke-linecap="round" stroke-linejoin="round">
				<path
					d="M -49 137 Q -49 130 -42 130 H -40 Q -33 130 -33 137 V 395 Q -33 401 -39 403 L -42 404 Q -49 404 -49 396 Z"
					fill="url(#hero-keyway-recess)"
				/>
				<path
					d="M -47 137 V 395"
					fill="none"
					stroke="var(--hero-groove-light)"
					stroke-opacity="0.5"
					stroke-width="1.35"
				/>
				<path
					d="M -34.5 137 V 395"
					fill="none"
					stroke="var(--hero-groove-shadow)"
					stroke-opacity="0.64"
					stroke-width="1.5"
				/>
				<path
					d="M -19 144 Q -19 137 -12 137 H -10 Q -4 137 -4 144 V 382 Q -4 388 -10 390 L -12 391 Q -19 391 -19 383 Z"
					fill="url(#hero-keyway-recess)"
				/>
				<path
					d="M -17 144 V 382"
					fill="none"
					stroke="var(--hero-groove-light)"
					stroke-opacity="0.46"
					stroke-width="1.15"
				/>
				<path
					d="M -5.5 144 V 382"
					fill="none"
					stroke="var(--hero-groove-shadow)"
					stroke-opacity="0.58"
					stroke-width="1.3"
				/>
			</g>
		</g>
	</g>

	<g class="hero-key__light-underlay">
		<path
			d="M 0 -108 C 62 -108 108 -61 108 1 C 108 51 84 86 57 101 C 53 104 54 111 54 119 L 54 132 C 38 140 20 145 3 145 L 1 158 C -13 164 -32 165 -49 158 L -51 137 C -51 128 -52 112 -57 101 C -84 86 -108 51 -108 1 C -108 -61 -62 -108 0 -108 Z"
			fill="url(#hero-fob-light-backing)"
			transform="translate(5.8 8) scale(1.105)"
		/>
	</g>
	<g class="hero-key__fob-light" transform="scale(1.105)">
		<RubberFob prefix="hero-fob-light" tone="orange" glossy={true} socket={true} />
	</g>
	<g class="hero-key__dark-underlay">
		<path
			d="M 0 -108 C 62 -108 108 -61 108 1 C 108 51 84 86 57 101 C 53 104 54 111 54 119 L 54 132 C 38 140 20 145 3 145 L 1 158 C -13 164 -32 165 -49 158 L -51 137 C -51 128 -52 112 -57 101 C -84 86 -108 51 -108 1 C -108 -61 -62 -108 0 -108 Z"
			fill="url(#hero-fob-dark-backing)"
			transform="translate(5.8 8) scale(1.105)"
		/>
	</g>
	<g class="hero-key__fob-dark" transform="scale(1.105)">
		<RubberFob
			prefix="hero-fob-dark"
			tone="black"
			glossy={kammergutBlackPaintGlossEnabled}
			socket={true}
		/>
	</g>
	<image
		class="hero-key__nostr-shadow"
		href="/nostr-mark.svg"
		x="-48"
		y="-37"
		width="92"
		height="92"
		opacity={embossedNostrEnabled ? 0.7 : 0}
		style="filter: brightness(0)"
	/>
	<image
		class:hero-key__nostr-mark--embossed={embossedNostrEnabled}
		class:hero-key__nostr-mark--flat={!embossedNostrEnabled}
		href="/nostr-mark.svg"
		x="-47"
		y="-39"
		width="92"
		height="92"
		opacity="0.9"
	/>
</svg>

<style>
	.hero-key {
		--hero-metal-0: #fafafa;
		--hero-metal-1: #e4e4e7;
		--hero-metal-2: #8f9298;
		--hero-metal-3: #f4f4f5;
		--hero-metal-4: #4b4d52;
		--hero-depth-0: #a1a1aa;
		--hero-depth-1: #52525b;
		--hero-depth-2: #18181b;
		--hero-edge-light: #fafafa;
		--hero-edge-shade: #5f6368;
		--hero-groove-light: #fafafa;
		--hero-groove-shadow: #59606a;
		--hero-groove-core: #252a31;
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
		--hero-nostr-flat-filter: brightness(0);
		--hero-nostr-filter: brightness(0) drop-shadow(0 1.2px 0 rgb(255 214 160 / 0.38));
	}
	.hero-key__fob-light {
		display: block;
	}
	.hero-key__fob-dark {
		display: none;
	}
	.hero-key__light-underlay {
		display: block;
	}
	.hero-key__dark-underlay {
		display: none;
	}
	.hero-key__nostr-shadow {
		filter: brightness(0);
	}
	.hero-key__nostr-mark--flat {
		filter: var(--hero-nostr-flat-filter);
	}
	.hero-key__nostr-mark--embossed {
		filter: var(--hero-nostr-filter);
	}
	:global(.dark) .hero-key {
		--hero-metal-0: #ffd08a;
		--hero-metal-1: #f7931a;
		--hero-metal-2: #c85f00;
		--hero-metal-3: #ffad42;
		--hero-metal-4: #672600;
		--hero-depth-0: #8f3c00;
		--hero-depth-1: #4b1c00;
		--hero-depth-2: #220b00;
		--hero-edge-light: #e47a08;
		--hero-edge-shade: #7b2c00;
		--hero-groove-light: #ffbd65;
		--hero-groove-shadow: #713000;
		--hero-groove-core: #421500;
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
		--hero-nostr-flat-filter: brightness(0) invert(1);
		--hero-nostr-filter: brightness(0) invert(1) drop-shadow(0 1.4px 1px rgb(0 0 0 / 0.92));
	}
	:global(.dark) .hero-key__fob-light {
		display: none;
	}
	:global(.dark) .hero-key__light-underlay {
		display: none;
	}
	:global(.dark) .hero-key__fob-dark {
		display: block;
	}
	:global(.dark) .hero-key__dark-underlay {
		display: block;
	}
	:global(.dark) .hero-key__nostr-shadow {
		filter: brightness(0);
	}
	:global(.dark) .hero-key__nostr-mark--embossed {
		filter: var(--hero-nostr-filter);
	}
</style>
