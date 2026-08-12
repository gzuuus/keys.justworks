<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';

	let { children } = $props();

	const nav = [
		{ href: '/', label: 'Home' },
		{ href: '/register', label: 'Create' },
		{ href: '/import', label: 'Import' },
		{ href: '/login', label: 'Log in' }
	];
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>keys.justworks</title>
</svelte:head>

<header class="mx-auto flex max-w-2xl items-baseline gap-6 px-4 pt-6">
	<a class="font-semibold no-underline" href="/">keys.justworks</a>

	<nav class="flex gap-4">
		{#each nav as item (item.href)}
			<a
				href={item.href}
				class={page.url.pathname === item.href
					? 'font-semibold no-underline'
					: 'no-underline text-neutral-600'}
			>{item.label}</a>
		{/each}
	</nav>
</header>

<main class="mx-auto max-w-2xl px-4 py-6">{@render children()}</main>
