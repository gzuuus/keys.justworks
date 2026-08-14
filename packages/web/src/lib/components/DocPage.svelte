<script lang="ts">
	import { marked } from 'marked';
	// Shared shell for the browsable repo docs (/docs, /docs/self-hosting): tabs
	// between the docs, copy-markdown, and the rendered article. Each route is a
	// thin wrapper importing its markdown via `?raw` (single source of truth —
	// the same file GitHub renders; see docs/integration.md's header comment).
	import { Button } from '$lib/components/ui/button';
	import Copy from '@lucide/svelte/icons/copy';
	import Check from '@lucide/svelte/icons/check';

	let {
		raw,
		slug
	}: { raw: string; slug: 'integration' | 'self-hosting' } = $props();

	const html = $derived(marked.parse(raw) as string);
	const tabs = [
		{ slug: 'integration', label: 'API & integration', href: '/docs' },
		{ slug: 'self-hosting', label: 'Self-hosting', href: '/docs/self-hosting' }
	] as const;

	let copied = $state(false);
	async function copy() {
		await navigator.clipboard.writeText(raw);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<!-- Sticky toolbar under the global header; the markdown's own H1 is the title. -->
<div class="border-line sticky top-16 z-30 border-b bg-paper/85 backdrop-blur-md">
	<div class="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
		<nav class="flex gap-1" aria-label="Documentation">
			{#each tabs as t (t.slug)}
				<a
					href={t.href}
					class="rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors {slug ===
					t.slug
						? 'bg-secondary text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					{t.label}
				</a>
			{/each}
		</nav>
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
