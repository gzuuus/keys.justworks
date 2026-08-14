<script lang="ts">
	let {
		prefix,
		tone = 'black',
		glossy = true,
		socket = false
	}: {
		prefix: string;
		tone?: 'black' | 'orange';
		glossy?: boolean;
		socket?: boolean;
	} = $props();

	const textureId = $derived(`${prefix}-rubber-texture`);
	const glossId = $derived(`${prefix}-black-paint-gloss`);
	const restrainedGlossId = $derived(`${prefix}-restrained-paint-gloss`);
	const activeGlossId = $derived(tone === 'orange' ? glossId : restrainedGlossId);
	const fillClipId = $derived(`${prefix}-fill-clip`);
	const shellGradientId = $derived(`${prefix}-shell-gradient`);
	const insetGradientId = $derived(`${prefix}-inset-gradient`);
	const glossGradientId = $derived(`${prefix}-gloss-gradient`);
	const fluidHighlightId = $derived(`${prefix}-fluid-highlight`);
	const fluidShadeId = $derived(`${prefix}-fluid-shade`);
	const insetReflectionId = $derived(`${prefix}-inset-reflection`);
	const reflectionBlurId = $derived(`${prefix}-reflection-blur`);
	const baseFobPath =
		'M 0 -108 C 62 -108 108 -61 108 1 C 108 51 84 86 57 101 C 53 104 54 111 54 119 L 54 132 C 38 140 19 145 0 145 C -19 145 -38 140 -54 132 L -54 119 C -54 111 -53 104 -57 101 C -84 86 -108 51 -108 1 C -108 -61 -62 -108 0 -108 Z';
	const wrappedFobPath =
		'M 0 -108 C 62 -108 108 -61 108 1 C 108 51 84 86 57 101 C 53 104 54 111 54 119 L 54 132 C 38 140 20 145 3 145 L 1 158 C -13 164 -32 165 -49 158 L -51 137 C -51 128 -52 112 -57 101 C -84 86 -108 51 -108 1 C -108 -61 -62 -108 0 -108 Z';
	const fobPath = $derived(socket ? wrappedFobPath : baseFobPath);
</script>

<defs>
	<linearGradient
		id={shellGradientId}
		x1="-88"
		y1="-96"
		x2="94"
		y2="134"
		gradientUnits="userSpaceOnUse"
	>
		<stop offset="0" stop-color="var(--fob-shell-0, #181818)" />
		<stop offset="0.42" stop-color="var(--fob-shell-1, #0A0A0A)" />
		<stop offset="0.74" stop-color="var(--fob-shell-mid, #070707)" />
		<stop offset="1" stop-color="var(--fob-shell-2, #030303)" />
	</linearGradient>
	<linearGradient
		id={insetGradientId}
		x1="-72"
		y1="-76"
		x2="78"
		y2="84"
		gradientUnits="userSpaceOnUse"
	>
		<stop offset="0" stop-color="var(--fob-inset-0, #181818)" />
		<stop offset="0.55" stop-color="var(--fob-inset-1, #0A0A0A)" />
		<stop offset="1" stop-color="var(--fob-inset-2, #030303)" />
	</linearGradient>
	<radialGradient id={glossGradientId} cx="0.32" cy="0.25" r="0.72">
		<stop offset="0" stop-color="#FAFAFA" stop-opacity="0.72" />
		<stop offset="0.42" stop-color="#FAFAFA" stop-opacity="0.18" />
		<stop offset="1" stop-color="#FAFAFA" stop-opacity="0" />
	</radialGradient>
	<radialGradient id={fluidHighlightId} cx="-48" cy="-62" r="142" gradientUnits="userSpaceOnUse">
		<stop offset="0" stop-color="var(--fob-fluid-light, #ffd09a)" stop-opacity="0.56" />
		<stop offset="0.32" stop-color="var(--fob-fluid-light, #ffd09a)" stop-opacity="0.25" />
		<stop offset="0.7" stop-color="var(--fob-fluid-light, #ffd09a)" stop-opacity="0.045" />
		<stop offset="1" stop-color="var(--fob-fluid-light, #ffd09a)" stop-opacity="0" />
	</radialGradient>
	<radialGradient id={fluidShadeId} cx="75" cy="96" r="136" gradientUnits="userSpaceOnUse">
		<stop offset="0" stop-color="var(--fob-fluid-shade, #3d0d00)" stop-opacity="0.58" />
		<stop offset="0.48" stop-color="var(--fob-fluid-shade, #3d0d00)" stop-opacity="0.18" />
		<stop offset="1" stop-color="var(--fob-fluid-shade, #3d0d00)" stop-opacity="0" />
	</radialGradient>
	<radialGradient id={insetReflectionId} cx="-38" cy="-48" r="112" gradientUnits="userSpaceOnUse">
		<stop offset="0" stop-color="var(--fob-inset-light, #ffb15d)" stop-opacity="0.38" />
		<stop offset="0.48" stop-color="var(--fob-inset-light, #ffb15d)" stop-opacity="0.12" />
		<stop offset="1" stop-color="var(--fob-inset-light, #ffb15d)" stop-opacity="0" />
	</radialGradient>
	<clipPath id={fillClipId} clipPathUnits="userSpaceOnUse">
		<circle data-fob-fill-reveal cx="0" cy="0" r="166" />
	</clipPath>
	<filter id={reflectionBlurId} x="-35%" y="-70%" width="170%" height="240%">
		<feGaussianBlur stdDeviation="12" />
	</filter>
	<filter id={textureId} x="-15%" y="-15%" width="130%" height="130%">
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
	<!-- Fine paint grain only; the orange volume comes from broad clipped color reflections below. -->
	<filter
		id={glossId}
		x="-8%"
		y="-8%"
		width="116%"
		height="116%"
		color-interpolation-filters="sRGB"
	>
		<feTurbulence
			type="fractalNoise"
			baseFrequency="0.032 0.28"
			numOctaves="2"
			seed="11"
			result="paint-grain"
		/>
		<feColorMatrix
			in="paint-grain"
			type="matrix"
			values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .032 0"
			result="soft-paint-grain"
		/>
		<feComposite
			in="soft-paint-grain"
			in2="SourceAlpha"
			operator="in"
			result="clipped-paint-grain"
		/>
		<feBlend in="SourceGraphic" in2="clipped-paint-grain" mode="soft-light" />
	</filter>
	<filter
		id={restrainedGlossId}
		x="-8%"
		y="-8%"
		width="116%"
		height="116%"
		color-interpolation-filters="sRGB"
	>
		<feTurbulence
			type="fractalNoise"
			baseFrequency="0.032 0.28"
			numOctaves="2"
			seed="11"
			result="black-grain"
		/>
		<feColorMatrix
			in="black-grain"
			type="matrix"
			values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .026 0"
			result="soft-black-grain"
		/>
		<feComposite
			in="soft-black-grain"
			in2="SourceAlpha"
			operator="in"
			result="clipped-black-grain"
		/>
		<feBlend in="SourceGraphic" in2="clipped-black-grain" mode="screen" />
	</filter>
</defs>

<g clip-path={`url(#${fillClipId})`}>
	<path
		data-fob-shadow
		d={fobPath}
		fill="var(--fob-shadow, #020202)"
		stroke="var(--fob-shadow, #020202)"
		stroke-width="var(--fob-shadow-width, 10)"
		stroke-linejoin="round"
		transform="translate(1 1.5)"
	/>
	<path
		data-fob-fill
		d={fobPath}
		fill={`url(#${shellGradientId})`}
		filter={`url(#${glossy ? activeGlossId : textureId})`}
	/>
	<circle
		data-fob-inset
		cy="-2"
		r="91"
		fill={`url(#${insetGradientId})`}
		stroke="var(--fob-inset-stroke, #030303)"
		stroke-width="var(--fob-inset-width, 6)"
		filter={`url(#${textureId})`}
	/>
	{#if glossy && tone === 'orange'}
		<path d={fobPath} fill={`url(#${fluidHighlightId})`} />
		<path d={fobPath} fill={`url(#${fluidShadeId})`} />
		<circle cy="-2" r="89.5" fill={`url(#${insetReflectionId})`} />
		<ellipse
			cx="-27"
			cy="-70"
			rx="58"
			ry="27"
			transform="rotate(-16 -27 -70)"
			fill="var(--fob-fluid-sheen, #ffb35b)"
			opacity="var(--fob-fluid-sheen-opacity, 0.18)"
			filter={`url(#${reflectionBlurId})`}
		/>
	{/if}
	{#if glossy && tone === 'black'}
		<path
			d={fobPath}
			fill={`url(#${glossGradientId})`}
			opacity="var(--fob-shell-gloss-opacity, 0.08)"
		/>
		<ellipse
			cx="-31"
			cy="-42"
			rx="58"
			ry="43"
			fill={`url(#${glossGradientId})`}
			opacity="var(--fob-gloss-opacity, 0.08)"
		/>
	{/if}
	{#if tone === 'black'}
		<path
			data-fob-seam
			d="M -94 48 C -76 83 -58 94 -55 105 C -53 113 -54 124 -54 132 C -38 140 -19 145 0 145 C 19 145 38 140 54 132 C 54 124 53 113 55 105 C 58 94 76 83 94 48"
			fill="none"
			stroke="var(--fob-seam, #050505)"
			stroke-opacity="var(--fob-seam-opacity, 0.34)"
			stroke-width="2"
		/>
	{/if}
	<path
		data-fob-outline
		d={fobPath}
		fill="none"
		stroke="var(--fob-outline, #050505)"
		stroke-width="var(--fob-outline-width, 3)"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
</g>
