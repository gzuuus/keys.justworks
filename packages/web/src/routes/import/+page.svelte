<script lang="ts">
	import { onDestroy } from 'svelte';
	import { identifierHash, register, ApiError } from '@kj/core';
	import { nip19 } from 'nostr-tools';
	import { createKeyholder, type Keyholder } from '$lib/keyholder/client';

	let nsec = $state('');
	let identifier = $state('');
	let password = $state('');
	let confirm = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);

	// Shown only after a successful import.
	let npub = $state<string | null>(null);
	let ncryptsecOut = $state<string | null>(null);
	let revealNcryptsec = $state(false);
	let copied = $state(false);

	// ponytail: a throwaway keyholder just for the import op (it does not hold a
	// key). Destroyed on unmount.
	let keyholder: Keyholder | null = null;
	onDestroy(() => {
		keyholder?.destroy();
		keyholder = null;
	});

	async function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		npub = ncryptsecOut = null;
		if (!nsec || !identifier || !password) {
			error = 'Fill in all fields.';
			return;
		}
		if (password !== confirm) {
			error = 'Passwords do not match.';
			return;
		}
		busy = true;
		try {
			if (!keyholder) keyholder = createKeyholder();
			// Brief-window discipline (design.md "Hardening website import"): lift the
			// nsec into a local and clear the input *before* the await, then hand it to
			// the Worker. The page never encrypts with it — the raw established key
			// lives only in the Worker for the encrypt, then is wiped.
			const nsecVal = nsec;
			nsec = '';
			const identifier_hash = await identifierHash(identifier);
			const { ncryptsec, pubkey } = await keyholder.import(nsecVal, identifier, password);
			const password_secret = await keyholder.passwordSecret(identifier, password);
			await register({
				identifierHash: identifier_hash,
				passwordSecret: password_secret,
				ncryptsec
			});
			npub = nip19.npubEncode(pubkey);
			ncryptsecOut = ncryptsec;
		} catch (e) {
			error = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Import failed.';
		} finally {
			busy = false;
		}
	}

	async function copy() {
		if (!ncryptsecOut) return;
		try {
			await navigator.clipboard.writeText(ncryptsecOut);
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 1500);
		} catch {
			revealNcryptsec = true;
		}
	}
</script>

<h1 class="text-xl font-semibold">Import a key</h1>

<p class="mt-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
	⚠ Importing an <strong>established</strong> key is the riskiest operation on this site. If you
	have the <strong>browser extension</strong>, import there instead — its input is isolated from
	page JS. Here, the raw key passes through page JS only briefly and is encrypted inside a Worker,
	but a compromised page at that moment would leak a key with your existing followers and
	reputation. <a class="underline" href="/">New here? Generate a fresh key instead.</a>
</p>

<form class="mt-4 flex flex-col gap-3" onsubmit={onSubmit}>
	<label class="flex flex-col gap-1 text-sm">
		Your nsec
		<input
			class="rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-base"
			type="password"
			bind:value={nsec}
			autocomplete="off"
			required
		/>
	</label>
	<small class="text-xs text-neutral-500"
		>Hidden by default. Pasted straight into the Worker for encryption.</small
	>

	<label class="flex flex-col gap-1 text-sm">
		Identifier
		<input
			class="rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-base"
			bind:value={identifier}
			autocomplete="username"
			required
		/>
	</label>
	<small class="text-xs text-neutral-500">
		The key is re-encrypted with <code>identifier ‖ password</code>. Reuse the identifier you'll
		remember, or pick a new one.
	</small>

	<label class="flex flex-col gap-1 text-sm">
		Password
		<input
			class="rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-base"
			type="password"
			bind:value={password}
			autocomplete="new-password"
			required
		/>
	</label>
	<label class="flex flex-col gap-1 text-sm">
		Confirm password
		<input
			class="rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-base"
			type="password"
			bind:value={confirm}
			autocomplete="new-password"
			required
		/>
	</label>

	{#if error}
		<p class="text-sm text-red-700">{error}</p>
	{/if}

	<button
		class="mt-2 self-start rounded-md bg-neutral-900 px-5 py-2.5 text-base text-white disabled:opacity-60"
		type="submit"
		disabled={busy}>{busy ? 'Importing…' : 'Import key'}</button
	>
</form>

{#if npub}
	<section class="mt-8 rounded-md border border-green-200 bg-green-50 p-4">
		<h2 class="text-lg font-semibold">Key imported ✓</h2>
		<p class="mt-1 text-sm">Now stored in your locker. Your public ID (npub):</p>
		<code class="mt-1 block rounded bg-white p-2 font-mono text-xs break-all">{npub}</code>

		<div class="mt-6 border-t border-dashed border-green-200 pt-4">
			<h3 class="text-sm font-semibold">Back up the encrypted blob</h3>
			<p class="mt-1 text-sm text-amber-700">
				You already hold the nsec you imported. Back up the <strong>ncryptsec</strong> too (encrypted
				— safe anywhere) so the locker can be restored independently of this site. There is no recovery
				if you lose your identifier and password.
			</p>
			<div class="mt-2 flex items-center gap-2">
				<input
					class="flex-1 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 font-mono text-xs"
					type={revealNcryptsec ? 'text' : 'password'}
					value={ncryptsecOut ?? ''}
					readonly
				/>
				<button
					class="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900"
					type="button"
					onclick={() => (revealNcryptsec = !revealNcryptsec)}
				>
					{revealNcryptsec ? 'Hide' : 'Reveal'}
				</button>
				<button
					class="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900"
					type="button"
					onclick={copy}>{copied ? 'Copied' : 'Copy'}</button
				>
			</div>
		</div>

		<p class="mt-4 text-sm text-amber-700">
			Save your <strong>identifier</strong> and <strong>password</strong> — you'll need both to log in
			from any device.
		</p>
	</section>
{/if}
