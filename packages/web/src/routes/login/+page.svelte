<script lang="ts">
	import { goto } from '$app/navigation';
	import { identifierHash, login, ApiError } from '@kj/core';
	import { keyholder } from '$lib/keyholder/store.svelte';
	import { accounts } from '$lib/keyholder/accounts.svelte';
	import ProfileChip from '$lib/components/profile-chip.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import LockOpen from '@lucide/svelte/icons/lock-open';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
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

<section
	class="flex min-h-[calc(100svh-4rem)] items-center justify-center bg-paper px-6 py-12 text-ink sm:px-10"
>
	<div class="w-full max-w-md">
		<a
			href="/"
			class="mb-12 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
		>
			<ArrowLeft class="size-4" /> Back
		</a>
		<div class="flex items-center justify-between border-b border-border pb-5">
			<h1 class="font-mono text-[0.68rem] font-bold tracking-[0.16em] uppercase">
				Returning keyholder
			</h1>
			<LockOpen class="size-5" />
		</div>
		{#if keyholder.autoLocked}
			<Alert class="mt-6 border-ink/25 bg-transparent text-ink">
				<TriangleAlert class="size-4" />
				<AlertDescription
					>Your key was auto-locked after inactivity. Unlock again to continue.</AlertDescription
				>
			</Alert>
		{/if}

		<form class="mt-8 flex flex-col gap-5" onsubmit={onUnlock}>
			<div class="flex flex-col gap-2">
				<Label for="identifier">Identifier</Label>
				<Input id="identifier" bind:value={identifier} autocomplete="username" required />
			</div>
			<div class="flex flex-col gap-2">
				<Label for="password">Password</Label>
				<Input
					id="password"
					type="password"
					bind:value={password}
					autocomplete="current-password"
					required
				/>
			</div>

			{#if error}<p class="text-sm font-medium text-destructive">{error}</p>{/if}

			<Button type="submit" size="lg" disabled={busy}>
				{busy ? 'Unlocking…' : 'Unlock'}
				{#if !busy}<ArrowRight class="size-4" />{/if}
			</Button>
			<Button href="/get-started" variant="outline" size="lg" class="w-full">
				No key yet? Create one
				<ArrowRight class="size-4" />
			</Button>
		</form>

		{#if accounts.list.length > 0}
			<div class="mt-8 border-t border-border pt-6">
				<p
					class="font-mono text-[0.64rem] font-bold tracking-[0.14em] text-muted-foreground uppercase"
				>
					On this device
				</p>
				<p class="mt-1 text-xs text-muted-foreground">
					Saved here — unlock without the server, even offline.
				</p>
				<div class="mt-4 flex flex-col gap-2">
					{#each accounts.list as { id, account } (id)}
						<div class="flex items-center gap-3 border border-border bg-transparent px-3 py-3">
							<div class="flex min-w-0 flex-1 flex-col gap-1">
								<ProfileChip npub={account.npub} />
								<span class="truncate text-sm font-medium">{account.label}</span><span
									class="truncate text-xs text-muted-foreground">{account.npub}</span
								>
							</div>
							<button
								type="button"
								class="shrink-0 p-1 text-muted-foreground transition-colors hover:bg-ink/8 hover:text-destructive"
								aria-label="Remove from this device"
								title="Remove from this device"
								onclick={() => accounts.remove(id)}><X class="size-4" /></button
							>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</section>
