<script lang="ts">
	import { identifierHash, register, ApiError } from '@kj/core';
	import { keyholder } from '$lib/keyholder/store.svelte';
	import { accounts } from '$lib/keyholder/accounts.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import SecretField from '$lib/components/secret-field.svelte';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';

	type Mode = 'create' | 'import';
	let mode = $state<Mode>('create');

	let nsec = $state('');
	let identifier = $state('');
	let password = $state('');
	let confirm = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);

	// Result after a successful key creation.
	let npub = $state<string | null>(null);
	let outNsec = $state<string | null>(null);
	let outNcryptsec = $state<string | null>(null);
	let npubCopied = $state(false);
	/** False only if the post-register auto-unlock failed (never expected): the
	 * success screen then falls back to the sign-in CTA. */
	let unlocked = $state(false);

	function switchMode(next: Mode) {
		if (next === mode) return;
		mode = next;
		error = null;
	}

	function resetResult() {
		npub = outNsec = outNcryptsec = null;
		npubCopied = false;
	}

	async function copyNpub() {
		if (!npub) return;
		await navigator.clipboard.writeText(npub);
		npubCopied = true;
		window.setTimeout(() => (npubCopied = false), 1600);
	}

	async function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		resetResult();
		if (mode === 'import' && !nsec.trim()) {
			error = 'Paste your nsec to import.';
			return;
		}
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
			const identifier_hash = await identifierHash(identifier);
			let blob: string;
			let np: string;
			let password_secret: string;
			let ns: string | null = null;
			if (mode === 'create') {
				({
					ncryptsec: blob,
					npub: np,
					nsec: ns,
					passwordSecret: password_secret
				} = await keyholder.create(identifier, password));
			} else {
				// Brief-window discipline (design.md "Hardening website import"): lift
				// the nsec and clear the input before the await, then hand it to the
				// Worker, which encrypts and wipes it.
				const nsecVal = nsec.trim();
				nsec = '';
				({
					ncryptsec: blob,
					npub: np,
					passwordSecret: password_secret
				} = await keyholder.import(nsecVal, identifier, password));
			}
			await register({
				identifierHash: identifier_hash,
				passwordSecret: password_secret,
				ncryptsec: blob
			});
			npub = np;
			outNsec = ns;
			outNcryptsec = blob;
			// Hold the freshly-registered key so the user skips the redundant
			// sign-in; the account exists server-side before we hold anything.
			// Mirrors /login: cache the blob so this device works offline next time.
			try {
				await keyholder.unlock(blob, identifier, password);
				accounts.save(identifier_hash, blob, np);
				unlocked = true;
			} catch {
				unlocked = false; // fall back to the /login CTA
			}
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Something went wrong. Please try again.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Get started · keys.justworks</title>
</svelte:head>

<section
	class="flex min-h-[calc(100svh-4rem)] items-center justify-center bg-paper px-6 py-10 sm:px-10 sm:py-12"
>
	<div class="w-full" class:max-w-lg={!npub} class:max-w-6xl={Boolean(npub)}>
		<a
			href="/"
			class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
		>
			<ArrowLeft class="size-4" /> Back
		</a>

		{#if !npub}
			<div class="mt-6">
				<p class="eyebrow">Get started</p>
				<h1 class="mt-2 text-3xl font-black tracking-tight">
					{mode === 'create' ? 'Create your key' : 'Import an existing key'}
				</h1>
				<p class="mt-2 text-muted-foreground">
					{mode === 'create'
						? 'Generated and encrypted in this browser. The server stores only the encrypted version — never your key.'
						: 'Add a key you already have to the locker, encrypted with a new identifier + password.'}
				</p>
				<button
					type="button"
					class="mt-1 text-sm font-semibold text-mint-deep underline-offset-4 hover:underline"
					onclick={() => switchMode(mode === 'create' ? 'import' : 'create')}
				>
					{mode === 'create' ? 'Import an existing key instead' : 'Generate a new key instead'}
				</button>
			</div>

			<form class="mt-5 flex flex-col gap-4" onsubmit={onSubmit}>
				{#if mode === 'import'}
					<div class="flex flex-col gap-1.5">
						<Label for="nsec">Your nsec</Label>
						<Input
							id="nsec"
							type="password"
							bind:value={nsec}
							autocomplete="off"
							required
							placeholder="nsec1…"
						/>
						<p class="text-xs text-muted-foreground">
							Hidden by default. Pasted into the Worker for encryption.
						</p>
					</div>
					<Alert class="border-sun/40 bg-sun/10 text-sun-deep dark:text-sun">
						<TriangleAlert class="size-4" />
						<AlertDescription>
							Importing briefly exposes an established key to this page. The
							<a class="font-semibold underline" href="/download">browser extension</a> keeps it walled
							off — use it if you can.
						</AlertDescription>
					</Alert>
				{/if}
				<div class="flex flex-col gap-1.5">
					<Label for="identifier">Give your key a strong name</Label>
					<Input id="identifier" bind:value={identifier} autocomplete="username" required />
					<p class="text-xs text-muted-foreground">
						Choose something private and hard to guess. It strengthens security without being
						visible to the server.
					</p>
				</div>

				<div class="flex flex-col gap-4">
					<div class="flex flex-col gap-1.5">
						<Label for="password">Password</Label>
						<Input
							id="password"
							type="password"
							bind:value={password}
							autocomplete="new-password"
							required
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="confirm">Confirm password</Label>
						<Input
							id="confirm"
							type="password"
							bind:value={confirm}
							autocomplete="new-password"
							required
						/>
					</div>
				</div>

				{#if error}
					<p class="text-sm font-medium text-destructive">{error}</p>
				{/if}

				<div>
					<Button class="w-full" type="submit" size="lg" disabled={busy}>
						{busy
							? mode === 'create'
								? 'Creating…'
								: 'Importing…'
							: mode === 'create'
								? 'Create key'
								: 'Import key'}
						{#if !busy}<ArrowRight class="size-4" />{/if}
					</Button>
					<p class="mt-2 text-center text-sm text-muted-foreground">
						No recovery — save your identifier and password.
					</p>
				</div>
			</form>

			<Button href="/login" variant="outline" size="lg" class="mt-5 w-full">
				Already in the locker? Unlock it.
			</Button>
		{:else}
			<!-- Success + backup -->
			<div class="mt-6 grid gap-4 lg:grid-cols-2 lg:items-start">
				<div class="border border-mint/40 bg-mint/5 p-6">
					<p class="eyebrow">Key ready</p>
					<h1 class="mt-2 text-3xl font-black tracking-tight">Save your public ID</h1>
					<p class="mt-2 text-muted-foreground">
						Your npub identifies you to people and apps on Nostr. It is safe to share; your private
						key stays encrypted.
					</p>

					<div class="mt-8 flex items-center gap-2.5 border-t border-mint/30 pt-6">
						<CircleCheck class="size-6 text-mint-deep" />
						<h2 class="text-xl font-bold">Public ID created</h2>
					</div>
					<p class="mt-2 text-sm text-muted-foreground">Copy your npub before continuing:</p>
					<div class="mt-2 flex items-center border border-border bg-paper-strong">
						<code class="min-w-0 flex-1 p-2.5 font-mono text-xs break-all">{npub}</code>
						<Button
							variant="ghost"
							size="icon"
							class="mr-1 shrink-0"
							onclick={copyNpub}
							aria-label={npubCopied ? 'Public ID copied' : 'Copy public ID'}
							title={npubCopied ? 'Copied' : 'Copy npub'}
						>
							{#if npubCopied}<Check class="size-4" />{:else}<Copy class="size-4" />{/if}
						</Button>
					</div>
					<p class="mt-4 bg-sun/10 p-3 text-sm text-sun-deep dark:text-sun">
						Also save your <strong>identifier</strong> and <strong>password</strong> (a password manager
						is ideal). You'll need both to log in from any device.
					</p>
				</div>

				<div class="flex flex-col gap-3">
					<div class="space-y-4 border border-mint/40 bg-mint/5 p-6">
						<h3 class="font-bold">Back up your key</h3>
						<p class="text-sm text-muted-foreground">
							There is <strong>no recovery</strong>. If you lose both your identifier and password,
							the key is gone forever. Copy these into a password manager now.
						</p>

						{#if outNsec}
							<SecretField
								label="Private key (nsec)"
								value={outNsec}
								danger={true}
								hint="Anyone with this owns your identity. Store only in a password manager or fully offline."
							/>
						{/if}
						<SecretField
							label="Encrypted backup (ncryptsec)"
							value={outNcryptsec ?? ''}
							hint="Encrypted — safe to store in a cloud note or on a second device. Still needs your password."
						/>
					</div>
					{#if unlocked}
						<Button href="/app" size="lg" class="w-full">
							Go to dashboard <ArrowRight class="size-4" />
						</Button>
					{:else}
						<Button href="/login" size="lg" class="w-full">
							Unlock and use it <ArrowRight class="size-4" />
						</Button>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</section>
