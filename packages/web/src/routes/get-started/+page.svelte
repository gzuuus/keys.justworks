<script lang="ts">
	import { identifierHash, register, ApiError } from '@kj/core';
	import { keyholder } from '$lib/keyholder/store.svelte';
	import { accounts } from '$lib/keyholder/accounts.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import SecretField from '$lib/components/secret-field.svelte';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';

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
				<h1 class="mt-2 text-3xl font-black tracking-tight">Create your key</h1>
				<p class="mt-2 text-muted-foreground">
					Generated and encrypted in this browser. The server stores only the encrypted version —
					never your key.
				</p>
			</div>

			<form class="mt-5 flex flex-col gap-4" onsubmit={onSubmit}>
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
						{busy ? 'Creating…' : 'Create key'}
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
