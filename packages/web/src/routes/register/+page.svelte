<script lang="ts">
	import { onDestroy } from 'svelte';
	import { identifierHash, register, ApiError } from '@kj/core';
	import { createKeyholder, type Keyholder } from '$lib/keyholder/client';

	let identifier = $state('');
	let password = $state('');
	let confirm = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);

	// Shown only after a successful registration.
	let npub = $state<string | null>(null);
	let nsec = $state<string | null>(null);
	let ncryptsec = $state<string | null>(null);

	// Backup panel UI state (values stay hidden by default).
	let revealNsec = $state(false);
	let revealNcryptsec = $state(false);
	let copied = $state<string | null>(null);

	// ponytail: a throwaway keyholder used only for the `create` offload (it does
	// not hold a key). Destroyed on unmount.
	let keyholder: Keyholder | null = null;
	onDestroy(() => {
		keyholder?.destroy();
		keyholder = null;
	});

	async function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		npub = nsec = ncryptsec = null;
		if (!identifier || !password) {
			error = 'Enter an identifier and a password.';
			return;
		}
		if (password !== confirm) {
			error = 'Passwords do not match.';
			return;
		}
		busy = true;
		try {
			if (!keyholder) keyholder = createKeyholder();
			// Key generation + NIP-49 wrap + auth-secret derivation all run in the
			// Worker (off the main thread, and the raw 32 bytes never reach the page
			// — only the bech32 backup, which the user must see once).
			const identifier_hash = await identifierHash(identifier);
			const {
				ncryptsec: blob,
				npub: np,
				nsec: ns,
				passwordSecret: password_secret
			} = await keyholder.create(identifier, password);
			await register({
				identifierHash: identifier_hash,
				passwordSecret: password_secret,
				ncryptsec: blob
			});
			npub = np;
			nsec = ns;
			ncryptsec = blob;
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Something went wrong. Please try again.';
		} finally {
			busy = false;
		}
	}

	async function copy(text: string, which: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = which;
			setTimeout(() => {
				copied = null;
			}, 1500);
		} catch {
			// clipboard may be unavailable (insecure context); reveal and let the
			// user copy manually.
			if (which === 'nsec') revealNsec = true;
			else revealNcryptsec = true;
		}
	}
</script>

<h1 class="text-xl font-semibold">Create your key</h1>

<p class="mt-2 text-sm text-neutral-600">
	A fresh Nostr key is generated in your browser, encrypted with your identifier + password, and
	stored on the server. The server never sees the plaintext key. Save your identifier and password —
	there is no recovery.
</p>

<form class="mt-4 flex flex-col gap-3" onsubmit={onSubmit}>
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
		Defense-in-depth, not required to be strong — but a private, hard-to-guess identifier adds a
		layer the server can't see. We never enforce or reject it.
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
		disabled={busy}>{busy ? 'Creating…' : 'Create key'}</button
	>
</form>

<p class="mt-4 text-sm text-neutral-600">
	Already have a key? <a class="underline" href="/import">Import it</a> (advanced).
</p>

{#if npub}
	<section class="mt-8 rounded-md border border-green-200 bg-green-50 p-4">
		<h2 class="text-lg font-semibold">Key created ✓</h2>
		<p class="mt-1 text-sm">Your public ID (npub) — share it freely:</p>
		<code class="mt-1 block rounded bg-white p-2 font-mono text-xs break-all">{npub}</code>

		<div class="mt-6 border-t border-dashed border-green-200 pt-4">
			<h3 class="text-sm font-semibold">Back up your key</h3>
			<p class="mt-1 text-sm text-amber-700">
				There is no recovery. If you lose both your identifier and password, the key is gone
				forever. A backup you control is the only safety net — copy these now into a password
				manager.
			</p>

			<div class="mt-3 flex flex-col gap-4">
				<label class="flex flex-col gap-1 text-sm">
					<span>
						nsec <span class="text-neutral-500"
							>— survives a forgotten password (the only thing that does)</span
						>
					</span>
					<div class="mt-1 flex items-center gap-2">
						<input
							class="flex-1 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 font-mono text-xs"
							type={revealNsec ? 'text' : 'password'}
							value={nsec ?? ''}
							readonly
						/>
						<button
							class="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900"
							type="button"
							onclick={() => (revealNsec = !revealNsec)}
						>
							{revealNsec ? 'Hide' : 'Reveal'}
						</button>
						<button
							class="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900"
							type="button"
							onclick={() => copy(nsec ?? '', 'nsec')}
						>
							{copied === 'nsec' ? 'Copied' : 'Copy'}
						</button>
					</div>
					<small class="text-xs text-red-700">
						Anyone with this owns your identity. Store only in a password manager or fully offline.
					</small>
				</label>

				<label class="flex flex-col gap-1 text-sm">
					<span>
						ncryptsec
						<span class="text-neutral-500"
							>— encrypted; survives the locker disappearing (still needs your password)</span
						>
					</span>
					<div class="mt-1 flex items-center gap-2">
						<input
							class="flex-1 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 font-mono text-xs"
							type={revealNcryptsec ? 'text' : 'password'}
							value={ncryptsec ?? ''}
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
							onclick={() => copy(ncryptsec ?? '', 'ncryptsec')}
						>
							{copied === 'ncryptsec' ? 'Copied' : 'Copy'}
						</button>
					</div>
					<small class="text-xs text-neutral-500"
						>Encrypted — safe to store in a cloud note or on a second device.</small
					>
				</label>
			</div>
		</div>

		<p class="mt-4 text-sm text-amber-700">
			Also save your <strong>identifier</strong> and <strong>password</strong> (a password manager is
			ideal). You will need both to log in from any device.
		</p>
	</section>
{/if}
