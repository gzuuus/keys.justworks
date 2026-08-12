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
			const { ncryptsec: blob, npub: np, nsec: ns, passwordSecret: password_secret } =
				await keyholder.create(identifier, password);
			await register({ identifierHash: identifier_hash, passwordSecret: password_secret, ncryptsec: blob });
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

<h1>Create your key</h1>

<p>
	A fresh Nostr key is generated in your browser, encrypted with your identifier
	+ password, and stored on the server. The server never sees the plaintext key.
	Save your identifier and password — there is no recovery.
</p>

<form onsubmit={onSubmit}>
	<label>
		Identifier
		<input bind:value={identifier} autocomplete="username" required />
	</label>
	<small class="hint">
		Defense-in-depth, not required to be strong — but a private, hard-to-guess
		identifier adds a layer the server can't see. We never enforce or reject it.
	</small>

	<label>
		Password
		<input type="password" bind:value={password} autocomplete="new-password" required />
	</label>
	<label>
		Confirm password
		<input type="password" bind:value={confirm} autocomplete="new-password" required />
	</label>

	{#if error}
		<p class="error">{error}</p>
	{/if}

	<button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create key'}</button>
</form>

<p class="alt-link">Already have a key? <a href="/import">Import it</a> (advanced).</p>

{#if npub}
	<section class="success">
		<h2>Key created ✓</h2>
		<p>Your public ID (npub) — share it freely:</p>
		<code class="npub">{npub}</code>

		<div class="backup">
			<h3>Back up your key</h3>
			<p class="warn">
				There is no recovery. If you lose both your identifier and password, the
				key is gone forever. A backup you control is the only safety net — copy
				these now into a password manager.
			</p>

			<div class="secret">
				<label>
					<span class="secret-title">
						nsec <em>— survives a forgotten password (the only thing that does)</em>
					</span>
					<div class="secret-row">
						<input type={revealNsec ? 'text' : 'password'} value={nsec ?? ''} readonly />
						<button type="button" class="ghost" onclick={() => (revealNsec = !revealNsec)}>
							{revealNsec ? 'Hide' : 'Reveal'}
						</button>
						<button type="button" class="ghost" onclick={() => copy(nsec ?? '', 'nsec')}>
							{copied === 'nsec' ? 'Copied' : 'Copy'}
						</button>
					</div>
					<small class="danger">
						Anyone with this owns your identity. Store only in a password manager or
						fully offline.
					</small>
				</label>

				<label>
					<span class="secret-title">
						ncryptsec
						<em>— encrypted; survives the locker disappearing (still needs your password)</em>
					</span>
					<div class="secret-row">
						<input type={revealNcryptsec ? 'text' : 'password'} value={ncryptsec ?? ''} readonly />
						<button type="button" class="ghost" onclick={() => (revealNcryptsec = !revealNcryptsec)}>
							{revealNcryptsec ? 'Hide' : 'Reveal'}
						</button>
						<button
							type="button"
							class="ghost"
							onclick={() => copy(ncryptsec ?? '', 'ncryptsec')}
						>
							{copied === 'ncryptsec' ? 'Copied' : 'Copy'}
						</button>
					</div>
					<small>Encrypted — safe to store in a cloud note or on a second device.</small>
				</label>
			</div>
		</div>

		<p class="warn">
			Also save your <strong>identifier</strong> and <strong>password</strong> (a password
			manager is ideal). You will need both to log in from any device.
		</p>
	</section>
{/if}

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 1rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.9rem;
	}
	input {
		padding: 0.5rem;
		border: 1px solid #ccc;
		border-radius: 5px;
		font-size: 1rem;
	}
	.hint {
		color: #666;
		font-size: 0.8rem;
		margin-top: -0.25rem;
	}
	button {
		align-self: flex-start;
		padding: 0.6rem 1.2rem;
		background: #1a1a1a;
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 1rem;
		cursor: pointer;
		margin-top: 0.5rem;
	}
	button:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.error {
		color: #b00020;
	}
	.alt-link {
		margin-top: 1rem;
		font-size: 0.9rem;
		color: #555;
	}
	.alt-link a {
		color: inherit;
	}
	.success {
		margin-top: 2rem;
		padding: 1rem;
		background: #f0f7f0;
		border: 1px solid #cfe3cf;
		border-radius: 6px;
	}
	.npub {
		display: block;
		word-break: break-all;
		font-size: 0.8rem;
		background: #fff;
		padding: 0.5rem;
		border-radius: 4px;
	}
	.backup {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px dashed #cfe3cf;
	}
	.backup h3 {
		margin: 0 0 0.25rem;
	}
	.secret {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 0.75rem;
	}
	.secret-title {
		font-size: 0.85rem;
	}
	.secret-title em {
		color: #666;
		font-style: normal;
		font-size: 0.8rem;
	}
	.secret-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-top: 0.25rem;
	}
	.secret-row input {
		flex: 1;
		font-family: monospace;
		font-size: 0.8rem;
	}
	.ghost {
		margin-top: 0;
		padding: 0.45rem 0.75rem;
		background: #fff;
		color: #1a1a1a;
		border: 1px solid #ccc;
		font-size: 0.85rem;
	}
	.warn {
		font-size: 0.85rem;
		color: #7a5400;
	}
	.danger {
		color: #b00020;
		font-size: 0.78rem;
	}
</style>
