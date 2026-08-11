<script lang="ts">
	import { identifierHash, passphrase } from '@kj/core';

	let status = $state('loading…');

	// Smoke-check that the shared core is wired through the workspace.
	(async () => {
		const p = passphrase('demo', 'secret');
		const h = await identifierHash('demo');
		status = `core wired — passphrase ${p.length} chars, hash ${h.slice(0, 12)}…`;
	})();
</script>

<main>
	<h1>keys.justworks</h1>
	<p>{status}</p>
	<p>API: <a href="/api/health">/api/health</a></p>
</main>

<style>
	main {
		font-family: system-ui, sans-serif;
		max-width: 40rem;
		margin: 2rem auto;
		padding: 0 1rem;
	}
</style>
