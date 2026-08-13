<script lang="ts">
	import { marked } from 'marked';
	// Single source of truth: docs/integration.md at the repo root. `?raw` gives
	// both the rendered HTML (via marked) and the raw markdown for the copy button.
	// Vite's default workspace-root detection (pnpm-workspace.yaml) lets the dev
	// server read across packages/web — no fs.allow config needed.
	import raw from '../../../../../docs/integration.md?raw';
	import { Button } from '$lib/components/ui/button';
	import Copy from '@lucide/svelte/icons/copy';
	import Check from '@lucide/svelte/icons/check';

	const html = marked.parse(raw) as string;

	let copied = $state(false);
	async function copy() {
		await navigator.clipboard.writeText(raw);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<svelte:head>
	<title>API &amp; integration — keys.justworks</title>
	<meta
		name="description"
		content="Developer guide: REST API, client-side crypto conventions, and golden vectors for integrating with keys.justworks."
	/>
</svelte:head>

<!-- Sticky toolbar under the global header; the markdown's own H1 is the title. -->
<div class="border-line sticky top-16 z-30 border-b bg-paper/85 backdrop-blur-md">
	<div class="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
		<p class="text-sm font-semibold text-muted-foreground">Documentation</p>
		<Button variant="outline" size="sm" onclick={copy} aria-label="Copy page as Markdown">
			{#if copied}
				<Check class="size-4 text-mint-deep" />
				Copied
			{:else}
				<Copy class="size-4" />
				Copy markdown
			{/if}
		</Button>
	</div>
</div>

<article
	class="mx-auto prose mt-8 max-w-3xl px-4 pb-20 prose-headings:text-ink prose-p:text-ink prose-a:text-mint-deep prose-a:no-underline hover:prose-a:underline prose-blockquote:text-muted-foreground prose-strong:text-ink prose-code:text-ink prose-code:before:hidden prose-code:after:hidden prose-pre:bg-secondary prose-pre:text-ink prose-li:text-ink prose-th:text-ink prose-td:text-ink"
>
	<!-- Trusted content: the markdown is committed in-repo, not user-supplied. -->
	{@html html}
</article>
