<script lang="ts">
	import { goto } from '$app/navigation';
	import { identifierHash, updateBlob, deleteAccount, ApiError } from '@kj/core';
	import { keyholder } from '$lib/keyholder/store.svelte';
	import { accounts } from '$lib/keyholder/accounts.svelte';
	import BunkerPanel from '$lib/components/bunker-panel.svelte';
	import SecretField from '$lib/components/secret-field.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import {
		Collapsible,
		CollapsibleContent,
		CollapsibleTrigger
	} from '$lib/components/ui/collapsible';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import LockOpen from '@lucide/svelte/icons/lock-open';
	import Lock from '@lucide/svelte/icons/lock';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Download from '@lucide/svelte/icons/download';
	import Copy from '@lucide/svelte/icons/copy';
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	let advancedOpen = $state(false);
	let copiedNpub = $state(false);

	// Change-password form state.
	let pwCurrent = $state('');
	let pwNew = $state('');
	let pwConfirm = $state('');
	let pwBusy = $state(false);
	let pwError = $state<string | null>(null);
	let pwDone = $state(false);

	// Erase form state.
	let delCurrent = $state('');
	let delConfirm = $state('');
	let delBusy = $state(false);
	let delError = $state<string | null>(null);

	// Backup-at-any-time state.
	let backupNsec = $state<string | null>(null);
	let backupBusy = $state(false);
	async function showBackup() {
		backupBusy = true;
		try {
			backupNsec = (await keyholder.exportNsec()).nsec;
		} catch {
			backupNsec = null;
		} finally {
			backupBusy = false;
		}
	}

	async function copyNpub() {
		if (!keyholder.npub) return;
		try {
			await navigator.clipboard.writeText(keyholder.npub);
			copiedNpub = true;
			setTimeout(() => (copiedNpub = false), 1500);
		} catch {
			// clipboard unavailable
		}
	}

	async function lock() {
		await keyholder.lock();
	}

	async function changePassword(event: SubmitEvent) {
		event.preventDefault();
		pwError = null;
		pwDone = false;
		const identifier = keyholder.identifier;
		if (!identifier) {
			pwError = 'No key is unlocked.';
			return;
		}
		if (!pwCurrent || !pwNew) {
			pwError = 'Fill in every field.';
			return;
		}
		if (pwNew !== pwConfirm) {
			pwError = 'New passwords do not match.';
			return;
		}
		pwBusy = true;
		try {
			const ih = await identifierHash(identifier);
			const current = await keyholder.passwordSecret(identifier, pwCurrent);
			const { ncryptsec: newBlob } = await keyholder.reencrypt(identifier, pwNew);
			const next = await keyholder.passwordSecret(identifier, pwNew);
			await updateBlob({
				identifierHash: ih,
				passwordSecret: current,
				newNcryptsec: newBlob,
				newPasswordSecret: next
			});
			// Keep the offline cache fresh: the blob is now re-wrapped under the new
			// password. Preserves any existing label.
			accounts.save(ih, newBlob, keyholder.npub!);
			pwDone = true;
			pwCurrent = pwNew = pwConfirm = '';
		} catch (e) {
			pwError =
				e instanceof ApiError && e.code === 'unauthorized'
					? 'Your current password is wrong.'
					: e instanceof ApiError
						? e.message
						: 'Something went wrong. Please try again.';
		} finally {
			pwBusy = false;
		}
	}

	async function erase(event: SubmitEvent) {
		event.preventDefault();
		delError = null;
		const identifier = keyholder.identifier;
		if (!identifier) {
			delError = 'No key is unlocked.';
			return;
		}
		if (delConfirm !== 'DELETE') {
			delError = 'Type DELETE to confirm.';
			return;
		}
		delBusy = true;
		try {
			const ih = await identifierHash(identifier);
			const current = await keyholder.passwordSecret(identifier, delCurrent);
			await deleteAccount({ identifierHash: ih, passwordSecret: current });
			accounts.remove(ih); // evict the offline cache so this account stops appearing
			keyholder.lock(); // wipe the held key; the nsec backup (if any) is unaffected
			await goto('/');
		} catch (e) {
			delError =
				e instanceof ApiError && e.code === 'unauthorized'
					? 'Your password is wrong.'
					: e instanceof ApiError
						? e.message
						: 'Something went wrong. Please try again.';
		} finally {
			delBusy = false;
		}
	}
</script>

<svelte:head>
	<title>Dashboard · keys.justworks</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-4 py-12">
	{#if keyholder.locked || !keyholder.npub}
		<!-- Guard: nothing unlocked -->
		<Card>
			<CardContent class="flex flex-col items-center gap-4 py-14 text-center">
				<span
					class="inline-flex size-14 items-center justify-center rounded-2xl bg-accent text-muted-foreground"
				>
					<Lock class="size-7" />
				</span>
				<div>
					<h1 class="text-xl font-bold">No key unlocked</h1>
					<p class="mt-1 text-sm text-muted-foreground">
						Unlock your locker to hold the key for this session and use the tools.
					</p>
				</div>
				<div class="flex gap-3">
					<Button href="/login"><LockOpen class="size-4" /> Unlock</Button>
					<Button href="/get-started" variant="outline">Get started</Button>
				</div>
			</CardContent>
		</Card>
	{:else}
		<div class="flex items-center justify-between gap-4">
			<div>
				<p class="text-xs font-bold tracking-[0.2em] text-mint-deep uppercase">Dashboard</p>
				<h1 class="mt-2 text-3xl font-black tracking-tight">Your key is ready</h1>
			</div>
			<Badge class="gap-1.5 bg-mint/15 text-mint-deep">
				<span class="size-1.5 rounded-full bg-mint"></span> unlocked
			</Badge>
		</div>

		<!-- Identity -->
		<Card class="mt-6">
			<CardHeader>
				<CardTitle class="flex items-center gap-2">
					<KeyRound class="size-5 text-mint-deep" /> Identity
				</CardTitle>
				<CardDescription
					>Your public ID (npub). Share it freely — it can't sign anything.</CardDescription
				>
			</CardHeader>
			<CardContent class="flex flex-col gap-3">
				<div class="flex items-center gap-2">
					<code
						class="border-line flex-1 rounded-lg border bg-muted p-2.5 font-mono text-xs break-all"
						>{keyholder.npub}</code
					>
					<Button variant="outline" size="icon" onclick={copyNpub} aria-label="Copy npub">
						{#if copiedNpub}
							<Check class="size-4 text-mint-deep" />
						{:else}
							<Copy class="size-4" />
						{/if}
					</Button>
				</div>
				<div class="flex flex-wrap gap-3">
					<Button variant="destructive" onclick={lock}><Lock class="size-4" /> Lock key</Button>
					<span class="self-center text-xs text-muted-foreground">
						The key lives only in a sealed-off part of your browser and auto-locks after ~30 min
						idle.
					</span>
				</div>
			</CardContent>
		</Card>

		<!-- Connected apps (NIP-46 bunker) -->
		<div class="mt-10">
			<BunkerPanel />
		</div>

		<!-- Advanced: dangerous / rare operations -->
		<Collapsible bind:open={advancedOpen} class="mt-10">
			<CollapsibleTrigger class="flex w-full items-center gap-2 text-left">
				<h2 class="text-xs font-bold tracking-[0.2em] text-quiet uppercase">Advanced</h2>
				<ChevronDown
					class="size-4 text-muted-foreground transition-transform {advancedOpen
						? 'rotate-180'
						: ''}"
				/>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div class="mt-4 flex flex-col gap-4">
					<!-- Back up key -->
					<Card>
						<CardHeader>
							<CardTitle class="flex items-center gap-2">
								<Download class="size-5" /> Back up your key
							</CardTitle>
							<CardDescription>
								Re-show your private key (nsec) to copy somewhere safe. You can do this any time
								while your key is unlocked.
							</CardDescription>
						</CardHeader>
						<CardContent class="flex flex-col gap-3">
							{#if backupNsec}
								<SecretField
									label="Private key (nsec)"
									value={backupNsec}
									danger={true}
									hint="Anyone with this owns your identity. Store only in a password manager or fully offline."
								/>
								<Button
									variant="outline"
									size="sm"
									class="self-start"
									onclick={() => (backupNsec = null)}>Hide</Button
								>
							{:else}
								<Button
									variant="outline"
									size="sm"
									class="self-start"
									disabled={backupBusy}
									onclick={showBackup}
								>
									{backupBusy ? 'Revealing…' : 'Reveal my key'}
								</Button>
							{/if}
						</CardContent>
					</Card>

					<!-- Change password -->
					<Card>
						<CardHeader>
							<CardTitle>Change password</CardTitle>
							<CardDescription>
								Re-encrypts your key with a new password. Your identifier stays the same; you'll use
								the new password to sign in everywhere.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<form class="flex flex-col gap-3" onsubmit={changePassword}>
								<div class="grid gap-3 sm:grid-cols-3">
									<div class="flex flex-col gap-1.5">
										<Label for="pw-cur">Current password</Label>
										<Input
											id="pw-cur"
											type="password"
											bind:value={pwCurrent}
											autocomplete="current-password"
										/>
									</div>
									<div class="flex flex-col gap-1.5">
										<Label for="pw-new">New password</Label>
										<Input
											id="pw-new"
											type="password"
											bind:value={pwNew}
											autocomplete="new-password"
										/>
									</div>
									<div class="flex flex-col gap-1.5">
										<Label for="pw-conf">Confirm new</Label>
										<Input
											id="pw-conf"
											type="password"
											bind:value={pwConfirm}
											autocomplete="new-password"
										/>
									</div>
								</div>
								{#if pwError}
									<p class="text-sm text-destructive">{pwError}</p>
								{/if}
								{#if pwDone}
									<p class="text-sm font-medium text-mint-deep">
										Password changed. Use the new password from now on.
									</p>
								{/if}
								<Button type="submit" size="sm" class="self-start" disabled={pwBusy}>
									{pwBusy ? 'Changing…' : 'Change password'}
								</Button>
							</form>
						</CardContent>
					</Card>

					<!-- Erase from locker -->
					<Card class="border-destructive/40">
						<CardHeader>
							<CardTitle class="flex items-center gap-2 text-destructive">
								<TriangleAlert class="size-5" /> Erase from the locker
							</CardTitle>
							<CardDescription>
								Permanently removes your encrypted key from our server — you won't be able to sign
								in here anymore. If you saved your backup (the nsec), you still own the key
								elsewhere; we're just no longer holding it. If you didn't, it's gone for good.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<form class="flex flex-col gap-3" onsubmit={erase}>
								<div class="flex flex-col gap-1.5">
									<Label for="del-cur">Your password</Label>
									<Input
										id="del-cur"
										type="password"
										bind:value={delCurrent}
										autocomplete="current-password"
									/>
								</div>
								<div class="flex flex-col gap-1.5">
									<Label for="del-conf">Type DELETE to confirm</Label>
									<Input id="del-conf" bind:value={delConfirm} autocomplete="off" />
								</div>
								{#if delError}
									<p class="text-sm text-destructive">{delError}</p>
								{/if}
								<Button
									type="submit"
									variant="destructive"
									size="sm"
									class="self-start"
									disabled={delBusy}
								>
									{delBusy ? 'Erasing…' : 'Erase my key from the locker'}
								</Button>
							</form>
						</CardContent>
					</Card>
				</div>
			</CollapsibleContent>
		</Collapsible>
	{/if}
</div>
