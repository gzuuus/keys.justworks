<script lang="ts">
	import { goto } from '$app/navigation';
	import { identifierHash, login, ApiError } from '@kj/core';
	import { keyholder } from '$lib/keyholder/store.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import LockOpen from '@lucide/svelte/icons/lock-open';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	let identifier = $state('');
	let password = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);

	async function onUnlock(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		if (!identifier || !password) {
			error = 'Enter your identifier and password.';
			return;
		}
		busy = true;
		try {
			const identifier_hash = await identifierHash(identifier);
			const password_secret = await keyholder.passwordSecret(identifier, password);
			const ncryptsec = await login({
				identifierHash: identifier_hash,
				passwordSecret: password_secret
			});
			// Decrypt + hold the key in the Worker. The store exposes only the npub;
			// the raw secret never leaves the Worker.
			await keyholder.unlock(ncryptsec, identifier, password);
			await goto('/app');
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Something went wrong. Please try again.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Unlock · keys.justworks</title>
</svelte:head>

<div class="mx-auto flex max-w-md flex-col px-4 py-12">
	<a
		href="/"
		class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
	>
		<ArrowLeft class="size-4" /> Back
	</a>

	<div class="mt-6 text-center">
		<span class="inline-flex size-12 items-center justify-center rounded-xl bg-ink text-mint">
			<LockOpen class="size-6" />
		</span>
		<h1 class="mt-4 text-3xl font-black tracking-tight">Unlock</h1>
		<p class="mt-2 text-sm text-muted-foreground">
			Your encrypted key is fetched and decrypted <strong class="font-semibold text-foreground"
				>in a sealed-off part of your browser</strong
			> — the raw key never reaches this page.
		</p>
	</div>

	{#if keyholder.autoLocked}
		<Alert class="mt-6 border-sun/40 bg-sun/10 text-[#8a5e10]">
			<TriangleAlert class="size-4" />
			<AlertDescription>
				Your key was auto-locked after inactivity. Unlock again to continue.
			</AlertDescription>
		</Alert>
	{/if}

	<form class="mt-6 flex flex-col gap-4" onsubmit={onUnlock}>
		<div class="flex flex-col gap-1.5">
			<Label for="identifier">Identifier</Label>
			<Input id="identifier" bind:value={identifier} autocomplete="username" required />
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="password">Password</Label>
			<Input
				id="password"
				type="password"
				bind:value={password}
				autocomplete="current-password"
				required
			/>
		</div>

		{#if error}
			<p class="text-sm font-medium text-destructive">{error}</p>
		{/if}

		<Button type="submit" size="lg" disabled={busy}>
			{busy ? 'Unlocking…' : 'Unlock'}
			{#if !busy}<ArrowRight class="size-4" />{/if}
		</Button>
	</form>

	<p class="mt-6 text-center text-sm text-muted-foreground">
		No key yet? <a class="font-semibold text-foreground underline" href="/get-started">Create one</a
		>.
	</p>
</div>
