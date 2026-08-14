<script lang="ts">
	// Same pattern as /docs: repo-root markdown via `?raw`, rendered by the
	// shared DocPage. The web app embeds docs, it never forks them.
	import raw from '../../../../../../docs/self-hosting.md?raw';
	import DocPage from '$lib/components/DocPage.svelte';
</script>

<svelte:head>
	<title>Self-hosting — keys.justworks</title>
	<meta
		name="description"
		content="Run your own keys.justworks server: one-line install, Docker, TLS, backups, and pointing the extension at your deployment."
	/>
</svelte:head>

<DocPage {raw} slug="self-hosting" />
