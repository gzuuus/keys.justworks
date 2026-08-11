<script lang="ts">
	import { decryptSecret, identifierHash, login, ApiError } from '@kj/core';
	import { getPublicKey, nip19 } from 'nostr-tools';

	let identifier = $state('');
	let password = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let npub = $state<string | null>(null);

	// ponytail: page-JS keyholding for this increment only — we decrypt to prove
	// the custody-free retrieval loop works, then drop the key. The design MVP
	// moves the held key into a Web Worker (and later a sandboxed vault iframe);
	// that lands in the next increment along with NIP-46 signing.

	async function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		npub = null;
		if (!identifier || !password) {
			error = 'Enter your identifier and password.';
			return;
		}
		busy = true;
		try {
			const identifier_hash = await identifierHash(identifier);
			const ncryptsec = await login({ identifierHash: identifier_hash, password });
			const secret = decryptSecret(ncryptsec, identifier, password);
			try {
				// If this npub matches the one shown at registration, the full
				// register → store → retrieve → decrypt loop is proven.
				npub = nip19.npubEncode(getPublicKey(secret));
			} finally {
				secret.fill(0); // best-effort wipe
			}
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Something went wrong. Please try again.';
		} finally {
			busy = false;
		}
	}
</script>

<h1>Log in</h1>

<p>
		Your encrypted key is fetched from the server and decrypted in your browser.
		The server verifies your password but can never see your key or identifier.
</p>

<form onsubmit={onSubmit}>
	<label>
		Identifier
		<input bind:value={identifier} autocomplete="username" required />
	</label>
	<label>
		Password
		<input type="password" bind:value={password} autocomplete="current-password" required />
	</label>

	{#if error}
		<p class="error">{error}</p>
	{/if}

	<button type="submit" disabled={busy}>{busy ? 'Unlocking…' : 'Unlock'}</button>
</form>

{#if npub}
	<section class="success">
		<h2>Unlocked ✓</h2>
		<p>Key recovered. Your npub:</p>
		<code class="npub">{npub}</code>
		<p class="muted">
			(Increment 1 only proves retrieval — the key is not held beyond this page.
			Holding it for signing via NIP-46 lands with the Web Worker keyholder.)
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
	.muted {
		font-size: 0.8rem;
		color: #666;
		margin-bottom: 0;
	}
</style>
