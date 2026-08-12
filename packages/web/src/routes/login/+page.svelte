<script lang="ts">
	import { onDestroy } from 'svelte';
	import { identifierHash, login, ApiError } from '@kj/core';
	import { nip19 } from 'nostr-tools';
	import { createKeyholder, type Keyholder } from '$lib/keyholder/client';

	let identifier = $state('');
	let password = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let npub = $state<string | null>(null);
	let locked = $state(true);
	let signedEvent = $state<string | null>(null);
	let autoLockedNote = $state(false);

	// ponytail: keyholder is page-scoped for this increment. A session-wide
	// singleton (so navigating between routes keeps the unlocked key) is a later
	// UX step; a page reload already drops it, which is correct (never persist).
	let keyholder: Keyholder | null = null;

	onDestroy(() => {
		keyholder?.destroy();
		keyholder = null;
	});

	async function onUnlock(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		signedEvent = null;
		autoLockedNote = false;
		if (!identifier || !password) {
			error = 'Enter your identifier and password.';
			return;
		}
		busy = true;
		try {
			if (!keyholder) {
				keyholder = createKeyholder();
				// The Worker wipes the key after idle and notifies us; reflect it in the UI.
				keyholder.onAutoLock = () => markLocked(true);
			}
			const identifier_hash = await identifierHash(identifier);
			const password_secret = await keyholder.passwordSecret(identifier, password);
			const ncryptsec = await login({ identifierHash: identifier_hash, passwordSecret: password_secret });
			// Decrypt + hold the key in the Worker. The page sees only the pubkey;
			// the raw secret never leaves the Worker.
			const { pubkey } = await keyholder.unlock(ncryptsec, identifier, password);
			npub = nip19.npubEncode(pubkey);
			locked = false;
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Something went wrong. Please try again.';
		} finally {
			busy = false;
		}
	}

	async function onSignTest() {
		if (!keyholder || locked) return;
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

	/** Reflect a locked key in the UI. `auto` flags an idle auto-lock for a note. */
	function markLocked(auto = false) {
		locked = true;
		npub = null;
		signedEvent = null;
		if (auto) autoLockedNote = true;
	}

	async function onLock() {
		await keyholder?.lock();
		markLocked(false);
	}
</script>

<h1>Log in</h1>

<p>
	Your encrypted key is fetched from the server and decrypted <strong>inside a Web
	Worker</strong> — the raw key never reaches this page. The Worker exposes the
	NIP-07 surface (<code>getPublicKey</code>, <code>signEvent</code>,
	<code>nip04</code>, <code>nip44</code>).
</p>

<form onsubmit={onUnlock}>
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

{#if autoLockedNote}
	<p class="note">Your key was auto-locked after inactivity. Unlock again to continue.</p>
{/if}

{#if !locked && npub}
	<section class="unlocked">
		<h2>Unlocked ✓</h2>
		<p>Key held in the Worker. Your npub:</p>
		<code class="npub">{npub}</code>

		<div class="actions">
			<button class="secondary" onclick={onSignTest}>Sign a test note</button>
			<button class="danger" onclick={onLock}>Lock</button>
		</div>

		{#if signedEvent}
			<pre class="signed">{signedEvent}</pre>
		{/if}
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
	.secondary {
		background: #fff;
		color: #1a1a1a;
		border: 1px solid #ccc;
	}
	.danger {
		background: #fff;
		color: #b00020;
		border: 1px solid #b00020;
	}
	.error {
		color: #b00020;
	}
	.note {
		color: #7a5400;
		font-size: 0.85rem;
	}
	.unlocked {
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
	.actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 1rem;
	}
	.actions button {
		margin-top: 0;
	}
	.signed {
		margin-top: 1rem;
		background: #1a1a1a;
		color: #eee;
		padding: 0.75rem;
		border-radius: 4px;
		font-size: 0.75rem;
		overflow-x: auto;
		white-space: pre-wrap;
		word-break: break-all;
	}
	code {
		background: #eee;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
		font-size: 0.9em;
	}
</style>
