<script lang="ts">
	import { identifierHash, register, ApiError } from '@kj/core';
	import { keyholder } from '$lib/keyholder/store.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import SecretField from '$lib/components/secret-field.svelte';
	import { cn } from '$lib/utils';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Download from '@lucide/svelte/icons/download';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
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

	// Result after a successful create/import.
	let npub = $state<string | null>(null);
	let outNsec = $state<string | null>(null);
	let outNcryptsec = $state<string | null>(null);

	function switchMode(next: Mode) {
		if (next === mode) return;
		mode = next;
		error = null;
		npub = outNsec = outNcryptsec = null;
	}

	function resetResult() {
		npub = outNsec = outNcryptsec = null;
	}

	async function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		resetResult();
		if (mode === 'import' && !nsec) {
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
			if (mode === 'create') {
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
			} else {
				// Brief-window discipline (design.md "Hardening website import"): lift the
				// nsec and clear the input before the await, then hand it to the Worker.
				const nsecVal = nsec;
				nsec = '';
				const {
					ncryptsec: blob,
					npub: np,
					passwordSecret: password_secret
				} = await keyholder.import(nsecVal, identifier, password);
				await register({
					identifierHash: identifier_hash,
					passwordSecret: password_secret,
					ncryptsec: blob
				});
				npub = np;
				outNcryptsec = blob;
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

<div class="mx-auto max-w-2xl px-4 py-12">
	<a
		href="/"
		class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
	>
		<ArrowLeft class="size-4" /> Back
	</a>

	<div class="mt-6">
		<p class="text-xs font-bold tracking-[0.2em] text-mint-deep uppercase">Get started</p>
		<h1 class="mt-2 text-3xl font-black tracking-tight">
			{mode === 'create' ? 'Create your key' : 'Import an existing key'}
		</h1>
		<p class="mt-2 text-muted-foreground">
			{mode === 'create'
				? 'A fresh key is generated in your browser, encrypted with your identifier + password, and stored. The server never sees your actual key — only the encrypted version.'
				: 'Add a key you already have to the locker, encrypted with a new identifier + password.'}
		</p>
	</div>

	{#if !npub}
		<!-- Segmented toggle -->
		<div class="border-line mt-6 inline-flex rounded-xl border bg-paper-strong p-1">
			<button
				type="button"
				onclick={() => switchMode('create')}
				class={cn(
					'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors',
					mode === 'create'
						? 'bg-ink text-paper-strong'
						: 'text-muted-foreground hover:text-foreground'
				)}
			>
				<KeyRound class="size-4" /> Generate new
			</button>
			<button
				type="button"
				onclick={() => switchMode('import')}
				class={cn(
					'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors',
					mode === 'import'
						? 'bg-ink text-paper-strong'
						: 'text-muted-foreground hover:text-foreground'
				)}
			>
				<Download class="size-4" /> Import nsec
			</button>
		</div>

		{#if mode === 'import'}
			<Alert variant="destructive" class="mt-5">
				<TriangleAlert class="size-4" />
				<AlertTitle>Use the browser extension if you can</AlertTitle>
				<AlertDescription>
					Importing a key you already use elsewhere briefly exposes it on this page — if anything
					here were compromised at that moment, that key could be stolen. We recommend the
					<strong>browser extension</strong> (coming soon) for imports.
					<button type="button" class="font-semibold underline" onclick={() => switchMode('create')}
						>New here? Generating a fresh key is the safest option.</button
					>
				</AlertDescription>
			</Alert>
		{/if}

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
			{/if}

			<div class="flex flex-col gap-1.5">
				<Label for="identifier">Identifier</Label>
				<Input id="identifier" bind:value={identifier} autocomplete="username" required />
				<p class="text-xs text-muted-foreground">
					Pick something private and hard to guess — it adds a layer of safety the server can't see.
					We'll never reject a “weak” one; that's your call.
				</p>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
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

			<div class="flex flex-wrap items-center gap-3">
				<Button type="submit" size="lg" disabled={busy}>
					{busy
						? mode === 'create'
							? 'Creating…'
							: 'Importing…'
						: mode === 'create'
							? 'Create key'
							: 'Import key'}
					{#if !busy}<ArrowRight class="size-4" />{/if}
				</Button>
				<span class="text-sm text-muted-foreground">
					No recovery — save your identifier and password.
				</span>
			</div>
		</form>

		<p class="mt-6 text-sm text-muted-foreground">
			Already in the locker? <a class="font-semibold text-foreground underline" href="/login"
				>Unlock it</a
			>.
		</p>
	{:else}
		<!-- Success + backup -->
		<div class="mt-6 rounded-2xl border border-mint/40 bg-mint/5 p-6">
			<div class="flex items-center gap-2.5">
				<CircleCheck class="size-6 text-mint-deep" />
				<h2 class="text-xl font-bold">{mode === 'create' ? 'Key created' : 'Key imported'}</h2>
			</div>
			<p class="mt-2 text-sm text-muted-foreground">Your public ID (npub) — share it freely:</p>
			<code
				class="border-line mt-2 block rounded-lg border bg-paper-strong p-2.5 font-mono text-xs break-all"
				>{npub}</code
			>

			<div class="border-line mt-6 space-y-4 border-t pt-5">
				<h3 class="font-bold">Back up your key</h3>
				<p class="text-sm text-muted-foreground">
					There is <strong>no recovery</strong>. If you lose both your identifier and password, the
					key is gone forever. Copy these into a password manager now.
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

			<p class="mt-5 rounded-lg bg-sun/10 p-3 text-sm text-[#8a5e10] dark:text-sun">
				Also save your <strong>identifier</strong> and <strong>password</strong> (a password manager is
				ideal). You'll need both to log in from any device.
			</p>

			<div class="mt-5 flex flex-wrap gap-3">
				<Button href="/login">Unlock and use it</Button>
				<Button href="/" variant="outline">Back to home</Button>
			</div>
		</div>
	{/if}
</div>
