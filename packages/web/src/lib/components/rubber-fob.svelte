<script lang="ts">
	let {
		prefix,
		tone = 'black',
		glossy = true
	}: {
		prefix: string;
		tone?: 'black' | 'orange';
		glossy?: boolean;
	} = $props();

	const textureId = $derived(`${prefix}-rubber-texture`);
	const glossId = $derived(`${prefix}-black-paint-gloss`);
	const restrainedGlossId = $derived(`${prefix}-restrained-paint-gloss`);
	const activeGlossId = $derived(tone === 'orange' ? glossId : restrainedGlossId);
	const fillClipId = $derived(`${prefix}-fill-clip`);
	const shellGradientId = $derived(`${prefix}-shell-gradient`);
	const insetGradientId = $derived(`${prefix}-inset-gradient`);
	const glossGradientId = $derived(`${prefix}-gloss-gradient`);
	const fobPath =
		'M 0 -108 C 62 -108 108 -61 108 2 C 108 54 84 87 52 104 L 42 134 Q 0 148 -42 134 L -52 104 C -84 87 -108 54 -108 2 C -108 -61 -62 -108 0 -108 Z';
</script>

<defs>
	<linearGradient id={shellGradientId} x1="0" y1="0" x2="0.9" y2="1">
		<stop offset="0" stop-color="var(--fob-shell-0, #181818)" />
		<stop offset="0.46" stop-color="var(--fob-shell-1, #0A0A0A)" />
		<stop offset="1" stop-color="var(--fob-shell-2, #030303)" />
	</linearGradient>
	<linearGradient id={insetGradientId} x1="0.12" y1="0" x2="0.86" y2="1">
		<stop offset="0" stop-color="var(--fob-inset-0, #181818)" />
		<stop offset="0.55" stop-color="var(--fob-inset-1, #0A0A0A)" />
		<stop offset="1" stop-color="var(--fob-inset-2, #030303)" />
	</linearGradient>
	<radialGradient id={glossGradientId} cx="0.32" cy="0.25" r="0.72">
		<stop offset="0" stop-color="#FAFAFA" stop-opacity="0.72" />
		<stop offset="0.42" stop-color="#FAFAFA" stop-opacity="0.18" />
		<stop offset="1" stop-color="#FAFAFA" stop-opacity="0" />
	</radialGradient>
	<clipPath id={fillClipId} clipPathUnits="userSpaceOnUse">
		<path
			data-fob-fill-reveal
			d="M -150 -140 C -112 -174 -58 -116 0 -146 C 58 -176 112 -118 150 -146 V 180 H -150 Z"
		/>
	</clipPath>
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
	<!-- Kammergut paintGloss, scaled to the fob. Set glossy=false above for an immediate revert. -->
	<filter
		id={glossId}
		x="-20%"
		y="-24%"
		width="140%"
		height="154%"
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
		<feBlend in="SourceGraphic" in2="clipped-paint-grain" mode="screen" result="painted" />
		<feGaussianBlur in="SourceAlpha" stdDeviation="1.4" result="paint-bump" />
		<feSpecularLighting
			in="paint-bump"
			surfaceScale="6"
			specularConstant="1.7"
			specularExponent="28"
			lighting-color="#FAFAFA"
			result="paint-spec-one"
		>
			<fePointLight x="-170" y="-220" z="300" />
		</feSpecularLighting>
		<feComposite in="paint-spec-one" in2="SourceAlpha" operator="in" result="paint-spec-one-clip" />
		<feSpecularLighting
			in="paint-bump"
			surfaceScale="4"
			specularConstant="0.9"
			specularExponent="40"
			lighting-color="#fff2d4"
			result="paint-spec-two"
		>
			<fePointLight x="260" y="-90" z="260" />
		</feSpecularLighting>
		<feComposite in="paint-spec-two" in2="SourceAlpha" operator="in" result="paint-spec-two-clip" />
		<feGaussianBlur in="SourceAlpha" stdDeviation="3" result="paint-shadow-blur" />
		<feOffset in="paint-shadow-blur" dx="0" dy="3" result="paint-shadow-offset" />
		<feComponentTransfer in="paint-shadow-offset" result="paint-shadow">
			<feFuncA type="linear" slope="0.38" />
		</feComponentTransfer>
		<feMerge>
			<feMergeNode in="paint-shadow" />
			<feMergeNode in="painted" />
			<feMergeNode in="paint-spec-one-clip" />
			<feMergeNode in="paint-spec-two-clip" />
		</feMerge>
	</filter>
	<filter
		id={restrainedGlossId}
		x="-16%"
		y="-18%"
		width="132%"
		height="142%"
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
		<feBlend in="SourceGraphic" in2="clipped-black-grain" mode="screen" result="black-painted" />
		<feGaussianBlur in="SourceAlpha" stdDeviation="1.15" result="black-bump" />
		<feSpecularLighting
			in="black-bump"
			surfaceScale="4"
			specularConstant="0.48"
			specularExponent="38"
			lighting-color="#765846"
			result="black-spec-one"
		>
			<fePointLight x="-170" y="-220" z="300" />
		</feSpecularLighting>
		<feComposite in="black-spec-one" in2="SourceAlpha" operator="in" result="black-spec-one-clip" />
		<feSpecularLighting
			in="black-bump"
			surfaceScale="3"
			specularConstant="0.16"
			specularExponent="52"
			lighting-color="#4c3324"
			result="black-spec-two"
		>
			<fePointLight x="260" y="-90" z="260" />
		</feSpecularLighting>
		<feComposite in="black-spec-two" in2="SourceAlpha" operator="in" result="black-spec-two-clip" />
		<feGaussianBlur in="SourceAlpha" stdDeviation="2.4" result="black-shadow-blur" />
		<feOffset in="black-shadow-blur" dx="0" dy="2" result="black-shadow-offset" />
		<feComponentTransfer in="black-shadow-offset" result="black-shadow">
			<feFuncA type="linear" slope="0.34" />
		</feComponentTransfer>
		<feMerge>
			<feMergeNode in="black-shadow" />
			<feMergeNode in="black-painted" />
			<feMergeNode in="black-spec-one-clip" />
			<feMergeNode in="black-spec-two-clip" />
		</feMerge>
	</filter>
</defs>

<path
	data-fob-shadow
	d={fobPath}
	fill="var(--fob-shadow, #020202)"
	stroke="var(--fob-shadow, #020202)"
	stroke-width="var(--fob-shadow-width, 10)"
	stroke-linejoin="round"
	transform="translate(1 1.5)"
/>
<g clip-path={`url(#${fillClipId})`}>
	<path
		data-fob-fill
		d={fobPath}
		fill={`url(#${shellGradientId})`}
		filter={`url(#${glossy ? activeGlossId : textureId})`}
	/>
	<circle
		data-fob-inset
		cy="-2"
		r="87"
		fill={`url(#${insetGradientId})`}
		stroke="var(--fob-inset-stroke, #030303)"
		stroke-width="var(--fob-inset-width, 6)"
		filter={`url(#${textureId})`}
	/>
	{#if glossy}
		<ellipse
			cx="-31"
			cy="-42"
			rx="58"
			ry="43"
			fill={`url(#${glossGradientId})`}
			opacity="var(--fob-gloss-opacity, 0.08)"
		/>
	{/if}
	<path
		data-fob-seam
		d="M -94 45 C -76 85 -49 98 -44 129 Q 0 141 44 129 C 49 98 76 85 94 45"
		fill="none"
		stroke="var(--fob-seam, #050505)"
		stroke-opacity="var(--fob-seam-opacity, 0.34)"
		stroke-width="2"
	/>
</g>
<path
	data-fob-outline
	d={fobPath}
	fill="none"
	stroke="var(--fob-outline, #050505)"
	stroke-width="var(--fob-outline-width, 3)"
	stroke-linecap="round"
	stroke-linejoin="round"
/>
