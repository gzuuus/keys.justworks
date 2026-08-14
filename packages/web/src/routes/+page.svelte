<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { keyholder } from '$lib/keyholder/store.svelte';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import ParticleKeyIntro from '$lib/components/particle-key-intro.svelte';
	import HeroKey from '$lib/components/hero-key.svelte';

	let homeRoot = $state<HTMLElement>();
	let introFinished = $state(!keyholder.locked);
	let homeRevealed = $state(false);
	let revealStarted = false;
	let homeAnimation: { revert(): void } | null = null;
	let heroSound: HTMLAudioElement | null = null;

	async function revealHome() {
		if (!homeRoot || revealStarted) return;
		revealStarted = true;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			homeRevealed = true;
			return;
		}
		try {
			const { gsap } = await import('gsap');
			if (!homeRoot) return;
			const left = Array.from(homeRoot.querySelectorAll<HTMLElement>('[data-home-left]'));
			const right = Array.from(homeRoot.querySelectorAll<HTMLElement>('[data-home-right]'));
			const key = homeRoot.querySelector<HTMLElement>('[data-home-key]');
			heroSound = new Audio('/pop.mp3');
			heroSound.preload = 'auto';
			heroSound.volume = 0.68;
			const playHeroSound = () => {
				if (!heroSound) return;
				heroSound.currentTime = 0;
				void heroSound.play().catch(() => {
					// Autoplay can be blocked until the visitor has interacted with the page.
				});
			};
			homeAnimation = gsap.context(() => {
				gsap.set([...left, ...right], { y: 26, opacity: 0 });
				if (key) gsap.set(key, { x: 70, y: 18, opacity: 0 });
				homeRevealed = true;
				gsap
					.timeline({ defaults: { ease: 'power3.out' } })
					.to(left, { y: 0, opacity: 1, duration: 0.78, stagger: 0.075 })
					.to(right, { y: 0, opacity: 1, duration: 0.86, stagger: 0.08 }, 0.16)
					.call(playHeroSound, [], '>-0.12')
					.to(key, { x: 0, y: 0, opacity: 1, duration: 1.05, ease: 'expo.out' }, '<');
			}, homeRoot);
		} catch {
			// If the animation chunk fails to load, show the page rather than staying blank.
			homeRevealed = true;
		}
	}

	$effect(() => {
		if (introFinished && homeRoot) void revealHome();
	});

	onDestroy(() => {
		homeAnimation?.revert();
		heroSound?.pause();
		heroSound?.removeAttribute('src');
		heroSound?.load();
	});
</script>

<svelte:head>
	<title>keys.justworks — your Nostr key, everywhere, held by no one</title>
</svelte:head>

{#if keyholder.locked}
	<ParticleKeyIntro onfinish={() => (introFinished = true)} />
{/if}

<section
	bind:this={homeRoot}
	class:home-awaiting={!homeRevealed}
	class="relative grid min-h-[calc(100svh-4rem)] border-b border-border bg-paper text-ink lg:grid-cols-[0.43fr_0.57fr]"
>
	<div
		aria-hidden="true"
		class="pointer-events-none absolute top-[-1px] bottom-0 left-[43%] z-20 hidden w-px bg-border lg:block"
	></div>
	<div
		class="surface-noise order-2 flex flex-col justify-between px-6 py-10 sm:px-10 sm:py-14 lg:order-1 lg:px-[clamp(2.5rem,5vw,5.5rem)]"
	>
		<div data-home-left>
			<p class="font-mono text-[0.68rem] font-bold tracking-[0.16em] uppercase">
				Private by construction
			</p>
			<h2
				class="mt-8 max-w-[18ch] font-display text-3xl leading-[1.04] font-semibold tracking-[-0.04em] sm:text-4xl"
			>
				One encrypted key. Three guarantees.
			</h2>
			<p class="mt-6 max-w-[36rem] text-sm leading-6 text-muted-foreground sm:text-base">
				The server stores the thing it cannot read, under an identity it cannot reverse. Your
				browser does the sensitive work; every other surface stays deliberately dumb.
			</p>
		</div>

		<ol data-home-left class="mt-12 border-t border-border" aria-label="Privacy guarantees">
			<li class="grid grid-cols-[2rem_1fr] gap-4 border-b border-border py-4 pl-3">
				<span class="font-mono text-[0.65rem] text-mint-deep dark:text-mint">01</span>
				<div>
					<strong class="block text-sm font-bold">Encrypted before upload</strong>
					<span class="mt-1 block text-xs leading-5 text-quiet"
						>Raw keys never leave your device.</span
					>
				</div>
			</li>
			<li class="grid grid-cols-[2rem_1fr] gap-4 border-b border-border py-4 pl-3">
				<span class="font-mono text-[0.65rem] text-mint-deep dark:text-mint">02</span>
				<div>
					<strong class="block text-sm font-bold">Unlinkable at rest</strong>
					<span class="mt-1 block text-xs leading-5 text-quiet"
						>No npub, email, or readable identifier.</span
					>
				</div>
			</li>
			<li class="grid grid-cols-[2rem_1fr] gap-4 border-b border-border py-4 pl-3">
				<span class="font-mono text-[0.65rem] text-mint-deep dark:text-mint">03</span>
				<div>
					<strong class="block text-sm font-bold">Available everywhere</strong>
					<span class="mt-1 block text-xs leading-5 text-quiet"
						>Decrypt and sign from the browser you trust.</span
					>
				</div>
			</li>
		</ol>
	</div>

	<div
		class="relative order-1 flex min-h-[calc(100dvh-4rem)] flex-col justify-center overflow-hidden bg-paper px-6 py-16 text-ink sm:px-10 lg:order-2 lg:min-h-0 lg:px-[clamp(3rem,7vw,8rem)]"
	>
		<div
			data-home-key
			class="pointer-events-none absolute right-[-9.5rem] bottom-[-11rem] h-[min(82vh,42rem)] rotate-[5deg] sm:right-0 sm:bottom-[-8rem] sm:h-[min(62vh,32rem)] sm:rotate-[10deg] lg:right-[-2.5rem] lg:bottom-[-7rem] lg:h-[min(72vh,44rem)] 2xl:right-[1rem]"
		>
			<div class="h-full">
				<HeroKey class="h-full w-auto" />
			</div>
		</div>
		<div class="relative z-10 max-w-3xl">
			<h1
				data-home-right
				class="font-display text-[clamp(2.8rem,5.2vw,6.2rem)] leading-[0.94] font-semibold tracking-[-0.045em] text-balance"
			>
				Your key,<br />everywhere.<br /><span class="text-ink/42">Held by no one.</span>
			</h1>
			<p
				data-home-right
				class="mt-8 max-w-[13.5rem] text-base leading-7 text-ink/62 sm:max-w-lg sm:text-lg"
			>
				Sign in to your accounts. Everywhere and anywhere. Only you control it.
			</p>

			<div data-home-right class="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
				{#if keyholder.locked}
					<Button href="/get-started" size="lg" class="px-5 font-bold">
						Take control today
						<ArrowRight class="size-4" />
					</Button>
					<Button href="/login" variant="outline" size="lg" class="px-5 font-bold"
						>Already have an account</Button
					>
				{:else}
					<Button href="/app" size="lg" class="px-5 font-bold">
						Go to dashboard
						<ArrowRight class="size-4" />
					</Button>
				{/if}
			</div>
		</div>
	</div>
</section>

<style>
	.home-awaiting :global([data-home-left]),
	.home-awaiting :global([data-home-right]),
	.home-awaiting :global([data-home-key]) {
		opacity: 0;
	}
</style>
