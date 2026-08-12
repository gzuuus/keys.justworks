<script lang="ts">
	import { identifierHash, login, ApiError } from '@kj/core';
	import { keyholder } from '$lib/keyholder/store.svelte';

	let identifier = $state('');
	let password = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let signedEvent = $state<string | null>(null);

	async function onUnlock(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		signedEvent = null;
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
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Something went wrong. Please try again.';
		} finally {
			busy = false;
		}
	}

	async function onSignTest() {
		if (keyholder.locked) return;
		signedEvent = null;
		error = null;
		try {
			const evt = await keyholder.signEvent({
				kind: 1,
				content: 'signed via keys.justworks worker keyholder',
				tags: [],
				created_at: Math.floor(Date.now() / 1000)
			});
			signedEvent = JSON.stringify(evt, null, 2);
		} catch (e) {
			error = e instanceof Error ? e.message : 'signing failed';
		}
	}

	async function onLock() {
		await keyholder.lock();
		signedEvent = null;
	}
</script>

<h1 class="text-xl font-semibold">Log in</h1>

<p class="mt-2 text-sm text-neutral-600">
	Your encrypted key is fetched from the server and decrypted <strong>inside a Web Worker</strong> —
	the raw key never reaches this page. The Worker exposes the NIP-07 surface (<code
		>getPublicKey</code
	>, <code>signEvent</code>,
	<code>nip04</code>, <code>nip44</code>).
</p>

<form class="mt-4 flex flex-col gap-3" onsubmit={onUnlock}>
	<label class="flex flex-col gap-1 text-sm">
		Identifier
		<input
			class="rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-base"
			bind:value={identifier}
			autocomplete="username"
			required
		/>
	</label>
	<label class="flex flex-col gap-1 text-sm">
		Password
		<input
			class="rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-base"
			type="password"
			bind:value={password}
			autocomplete="current-password"
			required
		/>
	</label>

	{#if error}
		<p class="text-sm text-red-700">{error}</p>
	{/if}

	<button
		class="mt-2 self-start rounded-md bg-neutral-900 px-5 py-2.5 text-base text-white disabled:opacity-60"
		type="submit"
		disabled={busy}>{busy ? 'Unlocking…' : 'Unlock'}</button
	>
</form>

{#if keyholder.autoLocked}
	<p class="mt-4 text-sm text-amber-700">
		Your key was auto-locked after inactivity. Unlock again to continue.
	</p>
{/if}

{#if !keyholder.locked && keyholder.npub}
	<section class="mt-8 rounded-md border border-green-200 bg-green-50 p-4">
		<h2 class="text-lg font-semibold">Unlocked ✓</h2>
		<p class="mt-1 text-sm">Key held in the Worker. Your npub:</p>
		<code class="mt-1 block rounded bg-white p-2 font-mono text-xs break-all">{keyholder.npub}</code
		>

		<div class="mt-4 flex gap-3">
			<button
				class="rounded-md border border-neutral-300 bg-white px-5 py-2.5 text-base text-neutral-900"
				onclick={onSignTest}>Sign a test note</button
			>
			<button
				class="rounded-md border border-red-700 bg-white px-5 py-2.5 text-base text-red-700"
				onclick={onLock}>Lock</button
			>
		</div>

		{#if signedEvent}
			<pre
				class="mt-4 overflow-x-auto rounded bg-neutral-900 p-3 text-xs break-all whitespace-pre-wrap text-neutral-200">{signedEvent}</pre>
		{/if}
	</section>
{/if}
