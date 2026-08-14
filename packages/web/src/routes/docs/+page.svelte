<script lang="ts">
	// Single source of truth: docs/integration.md at the repo root. `?raw` gives
	// both the rendered HTML (via DocPage's marked) and the raw markdown for the
	// copy button. Vite's default workspace-root detection (pnpm-workspace.yaml)
	// lets the dev server read across packages/web — no fs.allow config needed.
	import raw from '../../../../../docs/integration.md?raw';
	import DocPage from '$lib/components/DocPage.svelte';
</script>

<svelte:head>
	<title>API &amp; integration — keys.justworks</title>
	<meta
		name="description"
		content="Developer guide: REST API, client-side crypto conventions, and golden vectors for integrating with keys.justworks."
	/>
</svelte:head>

<DocPage {raw} slug="integration" />
