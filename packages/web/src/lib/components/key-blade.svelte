<script lang="ts">
	// The key blade (depth extrusion, metal face, keyway grooves) shared by the
	// home hero and the intro animation. Ids are prefixed per instance; colors
	// come from the --key-* CSS vars so each surface themes its own metal.
	let { prefix }: { prefix: string } = $props();

	const depthLayers = [10, 8, 6, 4, 2];
</script>

<defs>
	<linearGradient id={`${prefix}-key-metal`} x1="0" y1="0" x2="1" y2="1">
		<stop offset="0" stop-color="var(--key-metal-0)" />
		<stop offset="0.18" stop-color="var(--key-metal-1)" />
		<stop offset="0.48" stop-color="var(--key-metal-2)" />
		<stop offset="0.72" stop-color="var(--key-metal-3)" />
		<stop offset="1" stop-color="var(--key-metal-4)" />
	</linearGradient>
	<linearGradient id={`${prefix}-key-depth`} x1="0" y1="0" x2="1" y2="1">
		<stop offset="0" stop-color="var(--key-depth-0)" />
		<stop offset="0.5" stop-color="var(--key-depth-1)" />
		<stop offset="1" stop-color="var(--key-depth-2)" />
	</linearGradient>
	<linearGradient id={`${prefix}-key-sheen`} x1="0" y1="0" x2="1" y2="0">
		<stop offset="0" stop-color="#FAFAFA" stop-opacity="0" />
		<stop offset="0.44" stop-color="#FAFAFA" stop-opacity="0" />
		<stop offset="0.52" stop-color="#FAFAFA" stop-opacity="0.5" />
		<stop offset="0.61" stop-color="#FAFAFA" stop-opacity="0" />
		<stop offset="1" stop-color="#FAFAFA" stop-opacity="0" />
	</linearGradient>
	<linearGradient id={`${prefix}-key-groove`} x1="0" y1="0" x2="1" y2="0">
		<stop offset="0" stop-color="var(--key-groove-light)" stop-opacity="0.64" />
		<stop offset="0.16" stop-color="var(--key-groove-core)" stop-opacity="0.58" />
		<stop offset="0.7" stop-color="var(--key-groove-shadow)" stop-opacity="0.88" />
		<stop offset="1" stop-color="var(--key-groove-core)" stop-opacity="0.36" />
	</linearGradient>
	<filter id={`${prefix}-key-invert`} color-interpolation-filters="sRGB">
		<feComponentTransfer>
			<feFuncR type="table" tableValues="1 0" />
			<feFuncG type="table" tableValues="1 0" />
			<feFuncB type="table" tableValues="1 0" />
			<feFuncA type="identity" />
		</feComponentTransfer>
	</filter>
	<filter id={`${prefix}-key-texture`} x="-16%" y="-12%" width="132%" height="124%">
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
	<filter id={`${prefix}-key-edge`} x="-8%" y="-5%" width="116%" height="112%">
		<feMorphology in="SourceAlpha" operator="erode" radius="1.35" result="inner" />
		<feComposite in="SourceAlpha" in2="inner" operator="out" result="edge" />
		<feGaussianBlur in="edge" stdDeviation="0.45" result="soft-edge" />
		<feFlood flood-color="var(--key-edge-light)" flood-opacity="0.62" result="light-color" />
		<feComposite in="light-color" in2="soft-edge" operator="in" result="edge-light" />
		<feOffset in="edge-light" dx="-0.8" dy="-0.8" result="top-light" />
		<feFlood flood-color="var(--key-edge-shade)" flood-opacity="0.55" result="shade-color" />
		<feComposite in="shade-color" in2="soft-edge" operator="in" result="edge-shade" />
		<feOffset in="edge-shade" dx="0.9" dy="1" result="bottom-shade" />
		<feMerge>
			<feMergeNode in="bottom-shade" />
			<feMergeNode in="SourceGraphic" />
			<feMergeNode in="top-light" />
		</feMerge>
	</filter>
	<mask
		id={`${prefix}-key-shape`}
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
				filter={`url(#${prefix}-key-invert)`}
			/>
		</g>
	</mask>
</defs>

{#each depthLayers as depth}
	<rect
		x="-120"
		y="-120"
		width="240"
		height="540"
		fill={`url(#${prefix}-key-depth)`}
		mask={`url(#${prefix}-key-shape)`}
		transform={`translate(${depth * 0.9} ${depth * 1.2})`}
	/>
{/each}
<g filter={`url(#${prefix}-key-edge)`}>
	<g mask={`url(#${prefix}-key-shape)`}>
		<rect
			x="-120"
			y="-120"
			width="240"
			height="540"
			fill={`url(#${prefix}-key-metal)`}
			filter={`url(#${prefix}-key-texture)`}
		/>
		<rect
			x="-148"
			y="-120"
			width="240"
			height="540"
			fill={`url(#${prefix}-key-sheen)`}
			opacity="0.24"
		/>
		<g stroke-linecap="round" stroke-linejoin="round">
			<path
				d="M -49 137 Q -49 130 -42 130 H -40 Q -33 130 -33 137 V 395 Q -33 401 -39 403 L -42 404 Q -49 404 -49 396 Z"
				fill={`url(#${prefix}-key-groove)`}
			/>
			<path
				d="M -47 137 V 395"
				fill="none"
				stroke="var(--key-groove-light)"
				stroke-opacity="0.5"
				stroke-width="1.35"
			/>
			<path
				d="M -34.5 137 V 395"
				fill="none"
				stroke="var(--key-groove-shadow)"
				stroke-opacity="0.64"
				stroke-width="1.5"
			/>
			<path
				d="M -19 144 Q -19 137 -12 137 H -10 Q -4 137 -4 144 V 382 Q -4 388 -10 390 L -12 391 Q -19 391 -19 383 Z"
				fill={`url(#${prefix}-key-groove)`}
			/>
			<path
				d="M -17 144 V 382"
				fill="none"
				stroke="var(--key-groove-light)"
				stroke-opacity="0.46"
				stroke-width="1.15"
			/>
			<path
				d="M -5.5 144 V 382"
				fill="none"
				stroke="var(--key-groove-shadow)"
				stroke-opacity="0.58"
				stroke-width="1.3"
			/>
		</g>
	</g>
</g>
