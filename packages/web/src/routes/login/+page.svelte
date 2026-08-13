<script lang="ts">
	import { goto } from '$app/navigation';
	import { identifierHash, login, ApiError } from '@kj/core';
	import { keyholder } from '$lib/keyholder/store.svelte';
	import { accounts } from '$lib/keyholder/accounts.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import LockOpen from '@lucide/svelte/icons/lock-open';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import X from '@lucide/svelte/icons/x';

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
			const ih = await identifierHash(identifier);
			const cached = accounts.lookup(ih);
			// Prefer the cached blob (offline, no round-trip). The server is the
			// authoritative fallback when the cache is missing, stale, or tampered.
			if (cached) {
				try {
					const res = await keyholder.unlock(cached.ncryptsec, identifier, password);
					if (res.npub === cached.npub) {
						accounts.touch(ih);
						await goto('/app');
						return;
					}
					// npub mismatch → swapped or stale blob. Drop it, fall through.
					accounts.remove(ih);
				} catch {
					// Decrypt failed: wrong password, or a stale cache (password changed
					// on another device). Fall through to the server to tell them apart.
				}
			}
			// Server-authoritative path.
			const password_secret = await keyholder.passwordSecret(identifier, password);
			const ncryptsec = await login({ identifierHash: ih, passwordSecret: password_secret });
			const res = await keyholder.unlock(ncryptsec, identifier, password);
			accounts.save(ih, ncryptsec, res.npub);
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

	{#if accounts.list.length > 0}
		<div class="border-line mt-8 border-t pt-6">
			<p class="text-center text-xs font-medium tracking-wide text-muted-foreground uppercase">
				On this device
			</p>
			<p class="mt-1 text-center text-xs text-muted-foreground">
				Saved here — unlock without the server, even offline.
			</p>
			<div class="mt-3 flex flex-col gap-2">
				{#each accounts.list as { id, account } (id)}
					<div
						class="border-line flex items-center gap-3 rounded-lg border bg-paper-strong px-3 py-2.5"
					>
						<span
							class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-mint-deep"
						>
							<KeyRound class="size-4" />
						</span>
						<div class="flex min-w-0 flex-1 flex-col">
							<span class="truncate text-sm font-medium">{account.label}</span>
							<span class="truncate text-xs text-muted-foreground">{account.npub}</span>
						</div>
						<button
							type="button"
							class="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
							aria-label="Remove from this device"
							title="Remove from this device"
							onclick={() => accounts.remove(id)}
						>
							<X class="size-4" />
						</button>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
