<script lang="ts">
	import { encryptSecret, identifierHash, register, ApiError } from '@kj/core';
	import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';

	let identifier = $state('');
	let password = $state('');
	let confirm = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let npub = $state<string | null>(null);

	// ponytail: generate-only for now. Importing an existing nsec puts a raw,
	// established key in page JS briefly (XSS risk per design.md "Key
	// provenance") — add it once the keyholder is in a Web Worker / vault iframe.
	// The decrypted/holding path also lands with the Worker (next increment).

	async function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		npub = null;
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
			// Fresh secp256k1 key from a CSPRNG (nostr-tools → @noble/curves).
			const secret = generateSecretKey();
			try {
				const pubkey = getPublicKey(secret); // hex
				const identifier_hash = await identifierHash(identifier);
				const ncryptsec = encryptSecret(secret, identifier, password);
				await register({ identifierHash: identifier_hash, password, ncryptsec });
				npub = nip19.npubEncode(pubkey);
			} finally {
				secret.fill(0); // best-effort wipe; JS GC makes this imperfect
			}
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Something went wrong. Please try again.';
		} finally {
			busy = false;
		}
	}
</script>

<h1>Create your key</h1>

<p>
		A fresh Nostr key is generated in your browser, encrypted with your
		identifier + password, and stored on the server. The server never sees the
		plaintext key. Save your identifier and password — there is no recovery.
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

{#if npub}
	<section class="success">
		<h2>Key created ✓</h2>
		<p>Your public ID (npub) — share it freely:</p>
		<code class="npub">{npub}</code>
		<p class="warn">
			Write down your identifier and password now (a password manager is ideal).
			You will need both to log in from any device. If you lose them, the key is
			gone — we cannot recover it.
		</p>
		<!-- TODO: one-time nsec / ncryptsec export (user-managed backup). -->
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
	.warn {
		font-size: 0.85rem;
		color: #7a5400;
		margin-bottom: 0;
	}
</style>
