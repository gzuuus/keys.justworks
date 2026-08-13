<script lang="ts">
	import { Button } from './ui/button';
	import { Input } from './ui/input';
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import Copy from '@lucide/svelte/icons/copy';
	import Check from '@lucide/svelte/icons/check';

	let {
		label,
		value,
		hint = '',
		danger = false
	}: { label: string; value: string; hint?: string; danger?: boolean } = $props();

	let revealed = $state(false);
	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			// clipboard unavailable (insecure context) — reveal so it can be copied by hand
			revealed = true;
		}
	}
</script>

<div class="flex flex-col gap-1.5">
	<span class="text-sm font-medium">{label}</span>
	<div class="flex items-center gap-2">
		<Input
			type={revealed ? 'text' : 'password'}
			{value}
			readonly
			class="flex-1 font-mono text-xs"
		/>
		<Button
			type="button"
			variant="outline"
			size="icon"
			onclick={() => (revealed = !revealed)}
			aria-label={revealed ? 'Hide' : 'Reveal'}
		>
			{#if revealed}
				<EyeOff class="size-4" />
			{:else}
				<Eye class="size-4" />
			{/if}
		</Button>
		<Button type="button" variant="outline" size="icon" onclick={copy} aria-label="Copy">
			{#if copied}
				<Check class="size-4 text-mint-deep" />
			{:else}
				<Copy class="size-4" />
			{/if}
		</Button>
	</div>
	{#if hint}
		<p class={'text-xs ' + (danger ? 'text-destructive' : 'text-muted-foreground')}>{hint}</p>
	{/if}
</div>
