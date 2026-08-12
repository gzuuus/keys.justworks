<script lang="ts">
	import './layout.css';
	import '../app.css';
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

<header>
	<a class="brand" href="/">keys.justworks</a>

	<nav>
		{#each nav as item (item.href)}
			<a
				href={item.href}
				class={page.url.pathname === item.href ? 'active' : ''}
			>{item.label}</a>
		{/each}
	</nav>
</header>

<main>{@render children()}</main>

<style>
	:global(body) {
		margin: 0;
		font-family: system-ui, sans-serif;
		color: #1a1a1a;
		background: #fafafa;
	}

	header {
		display: flex;
		align-items: baseline;
		gap: 1.5rem;
		max-width: 40rem;
		margin: 0 auto;
		padding: 1.5rem 1rem 0;
	}

	.brand {
		font-weight: 600;
		text-decoration: none;
		color: inherit;
	}

	nav {
		display: flex;
		gap: 1rem;
	}

	nav a {
		text-decoration: none;
		color: #555;
	}

	nav a.active {
		color: #1a1a1a;
		font-weight: 600;
	}

	main {
		max-width: 40rem;
		margin: 0 auto;
		padding: 1.5rem 1rem;
	}
</style>
