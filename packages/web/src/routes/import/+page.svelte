<script lang="ts">
	import { onDestroy } from 'svelte';
	import { identifierHash, passwordSecret, register, ApiError } from '@kj/core';
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
			const password_secret = await passwordSecret(identifier, password);
			await register({ identifierHash: identifier_hash, passwordSecret: password_secret, ncryptsec });
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

<h1>Import a key</h1>

<p class="danger-banner">
	⚠ Importing an <strong>established</strong> key is the riskiest operation on this site.
	If you have the <strong>browser extension</strong>, import there instead — its input is
	isolated from page JS. Here, the raw key passes through page JS only briefly and is
	encrypted inside a Worker, but a compromised page at that moment would leak a key with
	your existing followers and reputation. <a href="/">New here? Generate a fresh key instead.</a>
</p>

<form onsubmit={onSubmit}>
	<label>
		Your nsec
		<input type="password" bind:value={nsec} autocomplete="off" required />
	</label>
	<small class="hint">Hidden by default. Pasted straight into the Worker for encryption.</small>

	<label>
		Identifier
		<input bind:value={identifier} autocomplete="username" required />
	</label>
	<small class="hint">
		The key is re-encrypted with <code>identifier ‖ password</code>. Reuse the identifier
		you'll remember, or pick a new one.
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

	<button type="submit" disabled={busy}>{busy ? 'Importing…' : 'Import key'}</button>
</form>

{#if npub}
	<section class="success">
		<h2>Key imported ✓</h2>
		<p>Now stored in your locker. Your public ID (npub):</p>
		<code class="npub">{npub}</code>

		<div class="backup">
			<h3>Back up the encrypted blob</h3>
			<p class="warn">
				You already hold the nsec you imported. Back up the <strong>ncryptsec</strong> too
				(encrypted — safe anywhere) so the locker can be restored independently of this
				site. There is no recovery if you lose your identifier and password.
			</p>
			<div class="secret-row">
				<input type={revealNcryptsec ? 'text' : 'password'} value={ncryptsecOut ?? ''} readonly />
				<button type="button" class="ghost" onclick={() => (revealNcryptsec = !revealNcryptsec)}>
					{revealNcryptsec ? 'Hide' : 'Reveal'}
				</button>
				<button type="button" class="ghost" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
			</div>
		</div>

		<p class="warn">
			Save your <strong>identifier</strong> and <strong>password</strong> — you'll need both to
			log in from any device.
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
	.danger-banner {
		background: #fff4f4;
		border: 1px solid #f0c0c0;
		color: #7a1212;
		padding: 0.75rem;
		border-radius: 6px;
		font-size: 0.85rem;
	}
	.danger-banner a {
		color: inherit;
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
	.secret-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-top: 0.5rem;
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
	code {
		background: #eee;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
		font-size: 0.9em;
	}
</style>
