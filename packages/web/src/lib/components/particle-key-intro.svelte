<script lang="ts" module>
	/** Session flag marking the intro as seen; shared with the layout's dev replay control. */
	export const INTRO_SESSION_KEY = 'keys.justworks:intro-seen';
</script>

<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import KeyBlade from '$lib/components/key-blade.svelte';
	import RubberFob from '$lib/components/rubber-fob.svelte';
	import SkipForward from '@lucide/svelte/icons/skip-forward';
	import { siApple, siGoogle, siInstagram, siX, type SimpleIcon } from 'simple-icons';

	let { onfinish }: { onfinish?: () => void } = $props();

	type Gsap = (typeof import('gsap'))['gsap'];
	type Timeline = ReturnType<Gsap['timeline']>;
	type Service = { name: string; icon: SimpleIcon | 'microsoft' };
	type PositionedService = Service & { x: number; y: number };

	const services: Service[] = [
		{ name: 'Google', icon: siGoogle },
		{ name: 'Apple', icon: siApple },
		{ name: 'Microsoft', icon: 'microsoft' },
		{ name: 'X', icon: siX },
		{ name: 'Instagram', icon: siInstagram }
	];
	// Visual clockwise sweep requested: bottom-left → left → top → top-right → bottom-right.
	const serviceSequence = [3, 4, 0, 1, 2];
	const nostrStackOffsets = [
		[-12, -8],
		[-6, -4],
		[0, 0],
		[6, 4],
		[12, 8]
	];
	const keyScale = 0.82;
	const circuitShapes = [
		{ port: [0, -96], d: 'M 0 -96 L 0 -73 L -22 -73 L -22 -49', node: [-22, -49] },
		{ port: [77, -42], d: 'M 77 -42 L 55 -42 L 39 -26 L 39 -4', node: [39, -4] },
		{ port: [82, 25], d: 'M 82 25 L 59 25 L 38 5 L 38 -18', node: [38, -18] },
		{ port: [-72, 37], d: 'M -72 37 L -51 37 L -32 18 L -32 -5', node: [-32, -5] },
		{ port: [-78, -35], d: 'M -78 -35 L -56 -35 L -40 -19 L -40 4', node: [-40, 4] }
	];
	const breachDataTokens = [
		'EMAIL',
		'PASSHASH',
		'SESSION',
		'IP_ADDR',
		'DEVICE',
		'AD_ID',
		'GEOLOC',
		'CONTACTS',
		'BIOHASH',
		'RECOVERY',
		'SEARCH',
		'PURCHASE',
		'MSG_META',
		'PROFILE',
		'CONSENT',
		'LEAK_2.4M',
		'CRITICAL',
		'EXPOSED',
		'RETAINED',
		'CAPTURED',
		'LINKED',
		'REPLAYED',
		'FINGERPR',
		'ID_GRAPH'
	];
	const nostrDataTokens = [
		'EVENT:1',
		'SIGN',
		'NIP-07',
		'PUBKEY',
		'SIG:OK',
		'RELAY',
		'KIND:0',
		'KIND:1',
		'e-tag',
		'p-tag',
		'NIP-46',
		'NOTE',
		'VERIFY',
		'BUNKER',
		'AUTH',
		'ZAP',
		'KIND:7',
		'OK:true',
		'wss://',
		'npub1',
		'nsec••',
		'ENCRYPT',
		'DECRYPT',
		'PUBLISH'
	];
	const rainRows = 28;
	const introSoundCues = [
		['intro', '/intro.mp3', 0.62],
		['lock', '/nostr-lock.mp3', 0.72],
		['glitch', '/glitch.mp3', 0.56],
		['text', '/woosh.mp3', 0.58]
	] as const;
	const introLines = [
		'SIGN IN TO YOUR ACCOUNTS.',
		'EVERYWHERE AND ANYWHERE.',
		'ONLY YOU CONTROL IT.'
	];
	// One-switch timing control: set to 1 to restore the authored intro pace.
	const introTimeScale = 1.25;
	// The opening reveal and service-to-key stack run at double their authored pace.
	const openingTimeScale = 2;
	const openingDurationFactor = 1 / openingTimeScale;
	const compressedOpeningOffset = 3.04 * (1 - openingDurationFactor);
	// Keep the service ring readable for one extra real second before intake begins.
	const centralServicesHold = 1;

	let root = $state<HTMLDivElement>();
	let viewport = $state({ width: 1000, height: 1000, compact: false });
	let dismissed = $state(false);
	let introStarted = $state(false);
	let activeLine = $state('');
	// The scene stays CSS-hidden until GSAP has stamped every animation-start
	// state; otherwise the fully-assembled key and copy flash before frame one.
	let armed = $state(false);
	let ready = $state(false);
	let openingTimeline: Timeline | null = null;
	let intakeTimeline: Timeline | null = null;
	let copyTimeline: Timeline | null = null;
	let soundElements: HTMLAudioElement[] = [];
	let ambientTweens: Array<{ kill(): void }> = [];
	let splitInstances: Array<{ revert(): void }> = [];
	let restoreOverflow: (() => void) | null = null;
	let autoplayTimer: { kill(): void } | null = null;
	let finishNotified = false;

	const centre = $derived({
		x: viewport.width / 2,
		y: viewport.height * (viewport.compact ? 0.42 : 0.44)
	});
	const radiusX = $derived(
		viewport.compact ? viewport.width * 0.35 : Math.min(320, viewport.width * 0.29)
	);
	const radiusY = $derived(
		viewport.compact ? Math.min(235, viewport.height * 0.23) : Math.min(315, viewport.height * 0.3)
	);
	const keyPorts = $derived(
		circuitShapes.map((circuit) => ({
			x: centre.x + circuit.port[0] * keyScale,
			y: centre.y + circuit.port[1] * keyScale
		}))
	);
	const terminalColumnCount = $derived(viewport.width <= 680 ? 1 : viewport.width <= 1024 ? 2 : 3);
	const rainStreamCount = $derived(terminalColumnCount * (viewport.compact ? 7 : 10));
	const rainRowHeight = $derived(viewport.compact ? 18 : 21);
	const layout = $derived(
		services.map((service, index): PositionedService => {
			const angle = -Math.PI / 2 + (index * Math.PI * 2) / services.length;
			return {
				...service,
				x: centre.x + Math.cos(angle) * radiusX,
				y: centre.y + Math.sin(angle) * radiusY
			};
		})
	);

	function curvePath(item: PositionedService, index: number) {
		const port = keyPorts[index];
		const dx = port.x - item.x;
		const dy = port.y - item.y;
		const length = Math.max(1, Math.hypot(dx, dy));
		const direction = index % 2 === 0 ? 1 : -1;
		const nx = (-dy / length) * direction;
		const ny = (dx / length) * direction;
		const bend = viewport.compact ? 24 : 42;
		return `M ${item.x} ${item.y} C ${item.x + dx * 0.3 + nx * bend} ${item.y + dy * 0.3 + ny * bend}, ${item.x + dx * 0.72 - nx * bend * 0.55} ${item.y + dy * 0.72 - ny * bend * 0.55}, ${port.x} ${port.y}`;
	}

	function intakePath(item: PositionedService, index: number) {
		const port = keyPorts[index];
		const [offsetX, offsetY] = nostrStackOffsets[index];
		const targetX = centre.x + offsetX;
		const targetY = centre.y + offsetY;
		return `${curvePath(item, index)} C ${port.x + (targetX - port.x) * 0.34} ${port.y + (targetY - port.y) * 0.08}, ${port.x + (targetX - port.x) * 0.76} ${port.y + (targetY - port.y) * 0.88}, ${targetX} ${targetY}`;
	}

	function afterOpening(authoredTime: number) {
		return authoredTime - compressedOpeningOffset;
	}

	function rainStreamX(index: number) {
		return ((index + 0.5) * viewport.width) / rainStreamCount;
	}

	function killAnimations() {
		autoplayTimer?.kill();
		autoplayTimer = null;
		openingTimeline?.kill();
		openingTimeline = null;
		intakeTimeline?.kill();
		intakeTimeline = null;
		copyTimeline?.kill();
		copyTimeline = null;
		for (const tween of ambientTweens) tween.kill();
		ambientTweens = [];
		for (const split of splitInstances) split.revert();
		splitInstances = [];
	}

	function finish() {
		try {
			sessionStorage.setItem(INTRO_SESSION_KEY, '1');
		} catch {
			// Storage can be unavailable in hardened/private browser contexts.
		}
		killAnimations();
		for (const sound of soundElements) sound.pause();
		restoreOverflow?.();
		dismissed = true;
		if (!finishNotified) {
			finishNotified = true;
			onfinish?.();
		}
	}

	function startIntro() {
		if (!ready || introStarted) return;
		introStarted = true;
		intakeTimeline
			?.eventCallback('onComplete', () => {
				copyTimeline?.timeScale(introTimeScale).play(0);
			})
			.timeScale(introTimeScale)
			.play();
	}

	onMount(() => {
		try {
			if (sessionStorage.getItem(INTRO_SESSION_KEY) === '1') {
				dismissed = true;
				finishNotified = true;
				onfinish?.();
				return;
			}
		} catch {
			// Continue with the intro if session storage is unavailable.
		}

		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			finish();
			return;
		}

		let active = true;
		const previousOverflow = document.documentElement.style.overflow;
		document.documentElement.style.overflow = 'hidden';
		const sounds = Object.fromEntries(
			introSoundCues.map(([key, src, volume]) => {
				const sound = new Audio(src);
				sound.preload = 'auto';
				sound.volume = volume;
				return [key, sound];
			})
		) as Record<(typeof introSoundCues)[number][0], HTMLAudioElement>;
		const playSound = (key: keyof typeof sounds) => {
			const sound = sounds[key];
			sound.currentTime = 0;
			void sound.play().catch(() => {
				// Autoplay can be blocked until the visitor has interacted with the page.
			});
		};
		soundElements = Object.values(sounds);
		playSound('intro');
		restoreOverflow = () => {
			document.documentElement.style.overflow = previousOverflow;
			restoreOverflow = null;
		};

		void (async () => {
			// Fetch the animation chunks while the measured viewport re-renders the scene.
			const gsapModules = Promise.all([
				import('gsap'),
				import('gsap/MotionPathPlugin'),
				import('gsap/DrawSVGPlugin'),
				import('gsap/SplitText')
			]);
			gsapModules.catch(() => {
				// Failures surface where the modules are awaited; this only covers the early-return path.
			});
			viewport = {
				width: window.innerWidth,
				height: window.innerHeight,
				compact: window.matchMedia('(max-width: 680px)').matches
			};
			await tick();
			if (!active || !root) return;

			const [{ gsap }, { MotionPathPlugin }, { DrawSVGPlugin }, { SplitText }] = await gsapModules;
			gsap.registerPlugin(MotionPathPlugin, DrawSVGPlugin, SplitText);

			const stage = root;
			const el = <T extends Element>(selector: string) => stage.querySelector<T>(selector);
			const all = <T extends Element>(selector: string) =>
				Array.from(stage.querySelectorAll<T>(selector));

			const key = el<SVGGElement>('[data-key]');
			const keyWireframe = el<SVGGElement>('[data-key-wireframe]');
			const keyWireReveal = el<SVGRectElement>('[data-key-wire-reveal]');
			const keyMotion = el<SVGGElement>('[data-key-motion]');
			const keyOverlayMotion = el<SVGGElement>('[data-key-overlay-motion]');
			const nostr = el<SVGGElement>('[data-nostr]');
			const fobOutline = el<SVGPathElement>('[data-fob-outline]');
			const fobFillReveal = el<SVGGraphicsElement>('[data-fob-fill-reveal]');
			const fobShadow = el<SVGPathElement>('[data-fob-shadow]');
			const network = el<SVGGElement>('[data-network]');
			const dataField = el<SVGGElement>('[data-data-field]');
			const orbs = all<SVGGElement>('[data-orb]');
			const orbFidelity = all<SVGGElement>('[data-orb-fidelity]');
			const orbWires = all<SVGCircleElement>('[data-orb-wire]');
			const serviceLogos = all<SVGGElement>('[data-service-logo]');
			const serviceNostr = all<SVGGElement>('[data-service-nostr]');
			const flowPaths = all<SVGPathElement>('[data-flow]');
			const intakePaths = all<SVGPathElement>('[data-intake-path]');
			const basePaths = all<SVGPathElement>('[data-base]');
			const pulses = all<SVGCircleElement>('[data-pulse]');
			const wordLines = all<HTMLElement>('[data-copy-line]');
			const rainStreams = all<SVGGElement>('[data-rain-stream]');
			const breachRain = all<SVGGElement>('[data-rain-layer="breach"]');
			const nostrRain = all<SVGGElement>('[data-rain-layer="nostr"]');
			const glitchBands = all<SVGGElement>('[data-glitch-band]');
			const circuitPaths = all<SVGPathElement>('[data-key-circuit]');
			const circuitNodes = all<SVGCircleElement>('[data-key-circuit-node]');
			const circuitPulses = all<SVGCircleElement>('[data-key-circuit-pulse]');
			if (
				!key ||
				!keyWireframe ||
				!keyWireReveal ||
				!keyMotion ||
				!keyOverlayMotion ||
				!nostr ||
				!fobOutline ||
				!fobFillReveal ||
				!fobShadow ||
				intakePaths.length !== services.length ||
				circuitPaths.length !== services.length ||
				circuitNodes.length !== services.length ||
				circuitPulses.length !== services.length ||
				!dataField ||
				rainStreams.length !== rainStreamCount ||
				breachRain.length !== rainStreamCount ||
				nostrRain.length !== rainStreamCount ||
				glitchBands.length !== 5 ||
				!network ||
				orbs.length !== services.length ||
				orbFidelity.length !== services.length ||
				orbWires.length !== services.length ||
				serviceLogos.length !== services.length ||
				serviceNostr.length !== services.length
			) {
				// A missing element means the scene markup drifted; skip to the site instead of a dead screen.
				finish();
				return;
			}

			gsap.set(key, { opacity: 0 });
			gsap.set(keyWireframe, { opacity: 0 });
			gsap.set(keyWireReveal, { scaleY: 0, transformOrigin: '50% 50%' });
			gsap.set(keyMotion, { opacity: 1 });
			gsap.set(keyOverlayMotion, { opacity: 1 });
			gsap.set(orbs, { transformOrigin: '50% 50%', scale: 0.72, opacity: 0 });
			gsap.set(orbFidelity, { opacity: 0 });
			gsap.set(orbWires, { drawSVG: '0% 0%', opacity: 1 });
			gsap.set(serviceLogos, { transformOrigin: '50% 50%', opacity: 1, scale: 1, rotation: 0 });
			gsap.set(serviceNostr, {
				transformOrigin: '50% 50%',
				opacity: 0,
				scale: 0.56,
				rotation: 14
			});
			gsap.set(flowPaths, { drawSVG: '0% 0%' });
			gsap.set(basePaths, { opacity: 0 });
			gsap.set(nostr, { opacity: 0, scale: 0.76, transformOrigin: '50% 50%' });
			gsap.set(fobOutline, { drawSVG: '0% 100%', opacity: 0 });
			gsap.set(fobFillReveal, {
				scale: 0,
				transformOrigin: '50% 50%'
			});
			gsap.set(fobShadow, { opacity: 0 });
			gsap.set(wordLines, { display: 'none' });
			gsap.set(dataField, { opacity: 0 });
			gsap.set(breachRain, { opacity: 1 });
			gsap.set(nostrRain, { opacity: 0 });
			gsap.set(glitchBands, { opacity: 0, x: -viewport.width });
			gsap.set(circuitPaths, { drawSVG: '0% 100%', opacity: 0.3 });
			gsap.set(circuitNodes, { opacity: 0.42, scale: 1, transformOrigin: '50% 50%' });
			gsap.set(circuitPulses, { opacity: 0.72 });

			// Every element now carries its animation-start inline state, so the
			// CSS first-paint gate can lift within this same frame.
			armed = true;

			openingTimeline = gsap
				.timeline()
				.timeScale(openingTimeScale * introTimeScale)
				.to(keyWireframe, { opacity: 1, duration: 0.12, ease: 'sine.out' }, 0)
				.to(keyWireReveal, { scaleY: 1, duration: 0.9, ease: 'power2.inOut' }, 0)
				.to(key, { opacity: 1, duration: 0.72, ease: 'power2.out' }, 0.62)
				.to(keyWireframe, { opacity: 0, duration: 0.62, ease: 'sine.out' }, 0.64)
				.to(
					orbs,
					{ scale: 1, opacity: 1, duration: 0.74, stagger: 0.075, ease: 'back.out(1.45)' },
					0.18
				)
				.to(
					orbWires,
					{ drawSVG: '0% 100%', duration: 0.82, stagger: 0.075, ease: 'power2.inOut' },
					0.18
				)
				.to(orbFidelity, { opacity: 1, duration: 0.52, stagger: 0.075 }, 0.68)
				.to(orbWires, { opacity: 0, duration: 0.46, stagger: 0.055 }, 0.82)
				.to(basePaths, { opacity: 0.22, duration: 0.62 }, 0.42)
				.to(
					flowPaths,
					{ drawSVG: '0% 100%', duration: 1.15, stagger: 0.045, ease: 'power2.inOut' },
					0.38
				)
				.to(dataField, { opacity: 1, duration: 1.25, ease: 'sine.out' }, 0.12);

			flowPaths.forEach((path, index) => {
				ambientTweens.push(
					gsap.to(pulses[index], {
						duration: 2.3 + index * 0.08,
						repeat: -1,
						delay: index * -0.31,
						ease: 'none',
						motionPath: { path, align: path, alignOrigin: [0.5, 0.5], start: 1, end: 0 }
					})
				);
			});

			circuitPaths.forEach((path, index) => {
				ambientTweens.push(
					gsap.to(circuitPulses[index], {
						duration: 1.18 + index * 0.08,
						repeat: -1,
						delay: index * -0.19,
						ease: 'none',
						motionPath: { path, align: path, alignOrigin: [0.5, 0.5], start: 1, end: 0 }
					})
				);
			});

			rainStreams.forEach((stream, index) => {
				const streamHeight = rainRows * rainRowHeight;
				const startY = -streamHeight - (index % 5) * (viewport.height * 0.16);
				ambientTweens.push(
					gsap.fromTo(
						stream,
						{ y: startY },
						{
							y: viewport.height + streamHeight,
							duration: 7.2 + (index % 6) * 1.05,
							repeat: -1,
							delay: index * -0.83,
							ease: 'none'
						}
					)
				);
			});

			const intakeSequence = gsap.timeline({ paused: true });
			intakeTimeline = intakeSequence;
			const orderedServiceLogos = serviceSequence.map((index) => serviceLogos[index]);
			const orderedServiceNostr = serviceSequence.map((index) => serviceNostr[index]);
			intakeSequence
				.call(() => playSound('glitch'), [], 0)
				.to(
					orderedServiceLogos,
					{
						opacity: 0,
						scale: 0.58,
						rotation: -12,
						duration: 0.14,
						stagger: 0.08
					},
					0
				)
				.to(
					orderedServiceNostr,
					{
						opacity: 1,
						scale: 1,
						rotation: 0,
						duration: 0.18,
						stagger: 0.08,
						ease: 'back.out(1.6)'
					},
					0.04 * openingDurationFactor
				);
			serviceSequence.forEach((index, sequenceIndex) => {
				const orb = orbs[index];
				const at = 0.42 * openingDurationFactor + sequenceIndex * 0.12;
				intakeSequence
					.to(
						orb.querySelector('[data-orb-ring]'),
						{
							rotation: 210,
							duration: 1.18 * openingDurationFactor,
							ease: 'sine.inOut',
							svgOrigin: '0 0'
						},
						at
					)
					.to(
						flowPaths[index],
						{ drawSVG: '100% 100%', duration: 1.28 * openingDurationFactor, ease: 'sine.inOut' },
						at
					)
					.to(
						basePaths[index],
						{ opacity: 0, duration: 0.94 * openingDurationFactor, ease: 'sine.in' },
						at + 0.22 * openingDurationFactor
					)
					.to(
						orb,
						{
							scale: viewport.compact ? 0.68 : 0.74,
							duration: 1.62 * openingDurationFactor,
							ease: 'power2.inOut',
							motionPath: {
								path: intakePaths[index],
								align: intakePaths[index],
								alignOrigin: [0.5, 0.5]
							}
						},
						at + 0.06 * openingDurationFactor
					)
					.to(
						pulses[index],
						{ opacity: 0, duration: 0.4 * openingDurationFactor, ease: 'sine.in' },
						at + 0.82 * openingDurationFactor
					)
					.to(
						circuitPaths[index],
						{ opacity: 0.68, duration: 0.38 * openingDurationFactor, ease: 'power2.out' },
						at + 0.74 * openingDurationFactor
					)
					.to(
						circuitNodes[index],
						{
							opacity: 0.86,
							scale: 1.42,
							duration: 0.2 * openingDurationFactor,
							repeat: 1,
							yoyo: true,
							ease: 'sine.inOut'
						},
						at + 1.12 * openingDurationFactor
					);
			});
			intakeSequence.to(
				fobFillReveal,
				{ scale: 1, duration: 1.08, ease: 'power3.inOut' },
				afterOpening(3.12)
			);
			intakeSequence.call(() => playSound('lock'), [], afterOpening(3.12));
			intakeSequence.to(
				fobShadow,
				{ opacity: 1, duration: 0.58, ease: 'sine.out' },
				afterOpening(3.26)
			);
			intakeSequence.to(orbs, { opacity: 0, duration: 0.46, ease: 'sine.in' }, afterOpening(3.58));
			intakeSequence.to(
				nostr,
				{ opacity: 1, scale: 1, duration: 0.68, ease: 'power3.out' },
				afterOpening(3.64)
			);
			intakeSequence.to(
				fobOutline,
				{ opacity: 1, duration: 0.28, ease: 'sine.out' },
				afterOpening(3.95)
			);

			const copySequence = gsap.timeline({ paused: true, onComplete: finish });
			copyTimeline = copySequence;
			copySequence.fromTo(
				[keyMotion, keyOverlayMotion],
				{ y: 0, opacity: 1 },
				{
					y: viewport.height * 0.88,
					opacity: 0,
					duration: 1.48,
					ease: 'power3.in'
				}
			);
			copySequence.to(
				dataField,
				{ y: -viewport.height * 0.045, duration: 1.48, ease: 'power2.inOut' },
				0
			);
			copySequence.to(
				breachRain,
				{
					x: (index: number) => (index % 2 === 0 ? 15 : -12),
					opacity: 0.55,
					duration: 0.18,
					stagger: 0.006,
					ease: 'steps(3)'
				},
				0
			);
			copySequence.fromTo(
				glitchBands,
				{ x: -viewport.width * 0.7, opacity: 0 },
				{
					x: viewport.width * 0.72,
					opacity: 0.42,
					duration: 0.92,
					stagger: 0.07,
					ease: 'power1.inOut'
				},
				0
			);
			copySequence.to(dataField, { x: 12, duration: 0.14, ease: 'steps(2)' }, 0.12);
			copySequence.to(
				breachRain,
				{
					x: (index: number) => (index % 3 === 0 ? -28 : index % 3 === 1 ? 22 : -8),
					opacity: 0.3,
					duration: 0.34,
					stagger: 0.012,
					ease: 'steps(4)'
				},
				0.24
			);
			copySequence.to(dataField, { x: -9, duration: 0.16, ease: 'steps(2)' }, 0.3);
			copySequence.to(
				breachRain,
				{
					x: (index: number) => (index % 2 === 0 ? -36 : 30),
					opacity: 0,
					duration: 0.68,
					stagger: 0.018,
					ease: 'power2.in'
				},
				0.42
			);
			copySequence.fromTo(
				nostrRain,
				{
					x: (index: number) => (index % 2 === 0 ? -24 : 20),
					opacity: 0
				},
				{ x: 0, opacity: 1, duration: 0.82, stagger: 0.02, ease: 'power2.out' },
				0.48
			);
			copySequence.to(dataField, { x: 0, duration: 0.34, ease: 'power2.out' }, 0.74);
			copySequence.to(
				glitchBands,
				{ opacity: 0, duration: 0.38, stagger: 0.035, ease: 'sine.out' },
				0.98
			);
			copySequence.set(network, { opacity: 0 });
			wordLines.forEach((line, index) => {
				const split =
					index === 0 ? null : SplitText.create(line, { type: 'words', wordsClass: 'intro-word' });
				if (split) splitInstances.push(split);
				const lineStart = copySequence.duration();
				copySequence.call(
					() => playSound('text'),
					[],
					index === 0 ? 0 : Math.max(0, lineStart - 0.55)
				);
				copySequence
					.call(() => (activeLine = introLines[index]))
					.set(line, { display: 'block' })
					.fromTo(
						index === 0 ? line : (split?.words ?? line),
						index === 0
							? {
									yPercent: -118,
									opacity: 0
								}
							: { yPercent: -118, rotateX: 24, opacity: 0 },
						index === 0
							? {
									yPercent: 0,
									opacity: 1,
									duration: 0.96,
									ease: 'expo.out'
								}
							: {
									yPercent: 0,
									rotateX: 0,
									opacity: 1,
									duration: 0.82,
									stagger: 0.06,
									ease: 'expo.out'
								}
					)
					.to({}, { duration: 1.1 })
					.to(index === 0 ? line : (split?.words ?? line), {
						yPercent: 118,
						opacity: 0,
						duration: 0.62,
						stagger: 0.04,
						ease: 'expo.in'
					})
					.set(line, { display: 'none' });
			});
			copySequence.to(root, { opacity: 0, duration: 0.42, ease: 'power2.in' });
			ready = true;
			autoplayTimer = gsap.delayedCall(
				(2.55 * openingDurationFactor) / introTimeScale + centralServicesHold,
				startIntro
			);
		})().catch(() => {
			if (active) finish();
		});

		return () => {
			active = false;
			killAnimations();
			for (const sound of soundElements) {
				sound.pause();
				sound.removeAttribute('src');
				sound.load();
			}
			restoreOverflow?.();
		};
	});
</script>

{#if !dismissed}
	<div bind:this={root} class="key-intro" class:key-intro--armed={armed} data-testid="key-intro">
		<svg
			class="key-intro__art"
			viewBox={`0 0 ${viewport.width} ${viewport.height}`}
			aria-hidden="true"
		>
			<defs>
				<linearGradient id="current" x1="0" y1="0" x2="1" y2="0">
					<stop offset="0" stop-color="#FAFAFA" stop-opacity="0.16" />
					<stop offset="0.62" stop-color="#FAFAFA" />
					<stop offset="1" stop-color="#f7931a" />
				</linearGradient>
				<filter id="quiet-glow" x="-80%" y="-80%" width="260%" height="260%">
					<feGaussianBlur stdDeviation="4" result="blur" />
					<feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
				</filter>
				<filter id="matrix-glitch-soft" x="-8%" y="-90%" width="116%" height="280%">
					<feGaussianBlur stdDeviation={viewport.compact ? '2.4 1.8' : '4.2 2.6'} />
				</filter>
				<!-- Adapted from Kammergut's paintGloss: dark paint, a tight highlight, and no grey halo. -->
				<filter
					id="black-paint-gloss"
					x="-18%"
					y="-18%"
					width="136%"
					height="142%"
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
					<feGaussianBlur in="SourceAlpha" stdDeviation="1.05" result="paint-bump" />
					<feSpecularLighting
						in="paint-bump"
						surfaceScale="3.2"
						specularConstant="0.78"
						specularExponent="46"
						lighting-color="#FAFAFA"
						result="paint-spec"
					>
						<fePointLight x="-180" y="-260" z="300" />
					</feSpecularLighting>
					<feComposite in="paint-spec" in2="SourceAlpha" operator="in" result="paint-spec-clip" />
					<feGaussianBlur in="SourceAlpha" stdDeviation="2.4" result="paint-shadow-blur" />
					<feOffset in="paint-shadow-blur" dx="1.5" dy="3" result="paint-shadow-offset" />
					<feComponentTransfer in="paint-shadow-offset" result="paint-shadow">
						<feFuncA type="linear" slope="0.42" />
					</feComponentTransfer>
					<feMerge>
						<feMergeNode in="paint-shadow" />
						<feMergeNode in="painted" />
						<feMergeNode in="paint-spec-clip" />
					</feMerge>
				</filter>
				<filter
					id="key-wireframe"
					x="-20%"
					y="-20%"
					width="140%"
					height="140%"
					color-interpolation-filters="sRGB"
				>
					<feColorMatrix
						in="SourceGraphic"
						type="matrix"
						values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -0.333 -0.333 -0.333 0 1"
						result="dark-shape"
					/>
					<feComposite in="dark-shape" in2="SourceAlpha" operator="in" result="key-shape-alpha" />
					<feMorphology in="key-shape-alpha" operator="dilate" radius="2.2" result="wire-outer" />
					<feMorphology in="key-shape-alpha" operator="erode" radius="1.7" result="wire-inner" />
					<feComposite in="wire-outer" in2="wire-inner" operator="out" result="wire-outline" />
					<feFlood flood-color="#FAFAFA" result="wire-white" />
					<feComposite in="wire-white" in2="wire-outline" operator="in" />
				</filter>
				<clipPath id="key-wire-reveal">
					<rect data-key-wire-reveal x="-130" y="-130" width="260" height="550" />
				</clipPath>
			</defs>

			<g data-data-field opacity="0" pointer-events="none">
				{#each Array(terminalColumnCount - 1) as _, dividerIndex}
					<line
						x1={((dividerIndex + 1) * viewport.width) / terminalColumnCount}
						x2={((dividerIndex + 1) * viewport.width) / terminalColumnCount}
						y1="0"
						y2={viewport.height}
						stroke="#f7931a"
						stroke-opacity="0.045"
					/>
				{/each}
				{#each Array(rainStreamCount) as _, streamIndex}
					<g
						data-rain-stream
						transform={`translate(${rainStreamX(streamIndex)} 0)`}
						opacity={0.44 + (streamIndex % 4) * 0.06}
					>
						{#each [{ kind: 'breach', tokens: breachDataTokens }, { kind: 'nostr', tokens: nostrDataTokens }] as rainLayer}
							<g data-rain-layer={rainLayer.kind} opacity={rainLayer.kind === 'breach' ? 1 : 0}>
								{#each Array(rainRows) as _, rowIndex}
									{@const token =
										rainLayer.tokens[(rowIndex * 5 + streamIndex * 7) % rainLayer.tokens.length]}
									{@const isHead = rowIndex === rainRows - 1}
									{@const isAlert =
										token === 'SIGN' ||
										token === 'NIP-46' ||
										token === 'CRITICAL' ||
										token === 'EXPOSED' ||
										token === 'LEAK_2.4M'}
									<text
										x={((rowIndex * 7 + streamIndex * 11) % 9) - 4}
										y={rowIndex * rainRowHeight}
										fill={isAlert ? '#d13d52' : isHead ? '#FAFAFA' : '#f7931a'}
										fill-opacity={isHead ? 0.98 : 0.05 + rowIndex * 0.029}
										font-size={isHead ? (viewport.compact ? 8 : 9.6) : viewport.compact ? 6.2 : 7.3}
										font-family="ui-monospace, SFMono-Regular, Menlo, monospace"
										letter-spacing="0.7"
										text-anchor="middle">{token}</text
									>
								{/each}
							</g>
						{/each}
					</g>
				{/each}
				{#each [0.18, 0.34, 0.51, 0.68, 0.84] as bandY, bandIndex}
					<g
						data-glitch-band
						transform={`translate(0 ${viewport.height * bandY})`}
						filter="url(#matrix-glitch-soft)"
					>
						<rect
							x={-viewport.width * 0.36}
							y={viewport.compact ? -5 : -8}
							width={viewport.width * (0.42 + (bandIndex % 2) * 0.08)}
							height={viewport.compact ? 10 : 16}
							fill="#f7931a"
							opacity="0.08"
						/>
						<rect
							x={-viewport.width * 0.4}
							y="-1"
							width={viewport.width * 0.58}
							height={viewport.compact ? 1 : 1.5}
							fill="#f7931a"
							opacity="0.8"
						/>
						<rect
							x={viewport.width * (0.02 + bandIndex * 0.014)}
							y={viewport.compact ? -3 : -5}
							width={viewport.width * 0.07}
							height={viewport.compact ? 6 : 10}
							fill="#ffd0a0"
							opacity="0.13"
						/>
					</g>
				{/each}
			</g>

			<g data-network>
				<g fill="none">
					{#each layout as item, index (item.name)}
						<path data-base d={curvePath(item, index)} stroke="#dce2ea" stroke-width="1" />
						<path
							data-flow
							d={curvePath(item, index)}
							stroke="url(#current)"
							stroke-width="2"
							stroke-linecap="round"
						/>
						<path data-intake-path d={intakePath(item, index)} stroke="none" fill="none" />
						<circle data-pulse r="3.2" fill="#FAFAFA" filter="url(#quiet-glow)" />
					{/each}
				</g>

				<g transform={`translate(${centre.x} ${centre.y})`}>
					<g data-key-motion>
						<g data-key-wireframe clip-path="url(#key-wire-reveal)" filter="url(#key-wireframe)">
							<g transform="rotate(-90)">
								<image href="/key-silhouette.png" x="-396" y="-105" width="500" height="210" />
							</g>
						</g>
						<g data-key>
							<KeyBlade prefix="intro" />
							<g mask="url(#intro-key-shape)" fill="none">
								{#each circuitShapes as circuit, index}
									<path
										d={circuit.d}
										stroke="#321200"
										stroke-opacity="0.78"
										stroke-width="4.4"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
									<path
										data-key-circuit
										d={circuit.d}
										stroke={index % 2 === 0 ? '#fff0d9' : '#ff9e2f'}
										stroke-width={index === 0 ? 1.35 : 1.1}
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
									<circle
										cx={circuit.port[0]}
										cy={circuit.port[1]}
										r="4.6"
										fill="#321200"
										stroke={index % 2 === 0 ? '#fff0d9' : '#ff9e2f'}
										stroke-opacity="0.72"
										stroke-width="1"
									/>
									<circle
										cx={circuit.port[0]}
										cy={circuit.port[1]}
										r="1.5"
										fill={index % 2 === 0 ? '#FAFAFA' : '#ff9e2f'}
									/>
									<circle
										data-key-circuit-pulse
										r="2.1"
										fill={index % 2 === 0 ? '#FAFAFA' : '#ff9e2f'}
										filter="url(#quiet-glow)"
									/>
									<circle
										data-key-circuit-node
										cx={circuit.node[0]}
										cy={circuit.node[1]}
										r="2.6"
										fill={index % 2 === 0 ? '#FAFAFA' : '#ff9e2f'}
									/>
								{/each}
							</g>
						</g>
					</g>
				</g>

				{#each layout as item, index (item.name)}
					<g data-orb data-service={index} transform={`translate(${item.x} ${item.y})`}>
						<circle
							data-orb-wire
							r={viewport.compact ? 44 : 56}
							fill="none"
							stroke="#FAFAFA"
							stroke-width="1.4"
						/>
						<g data-orb-fidelity>
							<circle
								r={viewport.compact ? 39 : 50}
								fill="#0A0A0A"
								stroke="#FAFAFA"
								stroke-width="1.2"
								filter="url(#black-paint-gloss)"
							/>
							<circle
								data-orb-ring
								r={viewport.compact ? 44 : 56}
								fill="none"
								stroke="#f7931a"
								stroke-width="1.5"
								stroke-dasharray="5 10 28 10"
							/>
							<circle
								r={viewport.compact ? 33 : 43}
								fill="none"
								stroke="#FAFAFA"
								stroke-opacity="0.16"
							/>
							<g data-service-logo>
								{#if item.icon === 'microsoft'}
									<g fill="#FAFAFA" transform="translate(-21 -21)"
										><rect width="19" height="19" /><rect x="23" width="19" height="19" /><rect
											y="23"
											width="19"
											height="19"
										/><rect x="23" y="23" width="19" height="19" /></g
									>
								{:else}
									<path
										d={item.icon.path}
										fill="#FAFAFA"
										transform="translate(-25 -25) scale(2.0833)"
									/>
								{/if}
							</g>
							<g data-service-nostr>
								<image href="/nostr-mark.svg" x="-27" y="-27" width="54" height="54" />
							</g>
						</g>
					</g>
				{/each}

				<g transform={`translate(${centre.x} ${centre.y})`}>
					<g data-key-overlay-motion>
						<g data-guard>
							<g transform="scale(1.045)">
								<path
									d="M 0 -108 C 62 -108 108 -61 108 1 C 108 51 84 86 57 101 C 53 104 54 111 54 119 L 54 132 C 38 140 19 145 0 145 C -19 145 -38 140 -54 132 L -54 119 C -54 111 -53 104 -57 101 C -84 86 -108 51 -108 1 C -108 -61 -62 -108 0 -108 Z"
									fill="#030303"
									transform="scale(1.072)"
									clip-path="url(#intro-fob-fill-clip)"
								/>
								<RubberFob prefix="intro-fob" tone="black" />
							</g>
						</g>
						<g data-nostr>
							<image
								href="/key-mark.svg"
								x="-48"
								y="-37"
								width="92"
								height="92"
								opacity="0.7"
								style="filter: brightness(0)"
							/>
							<image href="/key-mark.svg" x="-47" y="-39" width="92" height="92" opacity="0.9" />
						</g>
					</g>
				</g>
			</g>
		</svg>

		<div class="key-intro__copy" aria-hidden="true">
			{#each introLines as line, index}
				<p data-copy-line>
					{#if index === 0}<span class="intro-key-word"
							>S<svg class="intro-key-glyph" viewBox="0 0 24 58" focusable="false"
								><circle cx="12" cy="10" r="7" /><path d="M12 17 V43 H18 V49 H12 V56" /></svg
							>GN</span
						>{' IN TO YOUR ACCOUNTS.'}{:else}{line}{/if}
				</p>
			{/each}
		</div>

		<Button
			variant="ghost"
			size="sm"
			class="key-intro__skip"
			onclick={finish}
			aria-label="Skip intro">Skip <SkipForward class="size-3.5" /></Button
		>
		<p class="sr-only" aria-live="polite">{activeLine}</p>
	</div>
{/if}

<style>
	.key-intro {
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
		position: fixed;
		inset: 0;
		z-index: 100;
		overflow: hidden;
		background: #0a0a0a;
		color: #fafafa;
	}
	/* Until GSAP stamps the animation-start states, only the black backdrop and
	   the skip control may paint — never the fully-assembled scene. */
	.key-intro:not(.key-intro--armed) .key-intro__art,
	.key-intro:not(.key-intro--armed) .key-intro__copy {
		visibility: hidden;
	}
	.key-intro__art {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
	}
	.key-intro__copy {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 7vw;
		pointer-events: none;
		perspective: 900px;
	}
	.key-intro__copy p {
		max-width: 16ch;
		margin: 0;
		padding: 0.1em 0;
		font-family: 'IBM Plex Mono', ui-monospace, 'SFMono-Regular', monospace;
		font-size: clamp(2.5rem, 6.4vw, 6.8rem);
		font-weight: 700;
		line-height: 1.02;
		letter-spacing: -0.018em;
		word-spacing: normal;
		text-align: center;
		text-wrap: balance;
	}
	:global(.intro-word) {
		display: inline-block;
	}
	:global(.intro-word:not(:last-child)) {
		margin-inline-end: 0.22em;
	}
	.intro-key-word {
		display: inline-flex;
		align-items: baseline;
		white-space: nowrap;
	}
	.intro-key-glyph {
		display: inline-block;
		width: 0.42em;
		height: 0.9em;
		margin-inline: 0.025em;
		transform: translateY(0.08em);
		overflow: visible;
		fill: none;
		stroke: currentColor;
		stroke-width: 3.4;
		stroke-linecap: round;
		stroke-linejoin: round;
		filter: drop-shadow(0 0 0.08em rgb(247 147 26 / 0.42));
	}
	:global(.key-intro__skip) {
		position: absolute;
		top: max(1rem, env(safe-area-inset-top));
		right: max(1rem, env(safe-area-inset-right));
		z-index: 5;
		border-color: transparent;
		background: transparent;
		color: rgb(255 255 255 / 0.52);
	}
	:global(.key-intro__skip:hover) {
		background: rgb(255 255 255 / 0.1);
		color: #fafafa;
	}
	@media (max-width: 680px) {
		.key-intro__copy p {
			font-size: clamp(2.35rem, 11.5vw, 4.7rem);
		}
	}
</style>
