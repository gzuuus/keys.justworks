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
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Tabs from '$lib/components/ui/tabs';
	import LockOpen from '@lucide/svelte/icons/lock-open';
	import Lock from '@lucide/svelte/icons/lock';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Plug from '@lucide/svelte/icons/plug';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import CircleHelp from '@lucide/svelte/icons/circle-help';
	import Download from '@lucide/svelte/icons/download';
	import Copy from '@lucide/svelte/icons/copy';
	import Check from '@lucide/svelte/icons/check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	let copiedNpub = $state(false);
	let activeTab = $state('identity');
	let previousTab = 'identity';

	$effect(() => {
		if (activeTab === previousTab) return;
		previousTab = activeTab;
		requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
	});

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

<div class="mx-auto max-w-3xl px-4 py-12 max-md:pb-32">
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
		<div>
			<p class="text-xs font-bold tracking-[0.2em] text-mint-deep uppercase">Dashboard</p>
			<h1 class="mt-2 text-3xl font-black tracking-tight">Your key is ready</h1>
		</div>

		<Tabs.Root bind:value={activeTab} class="mt-7 gap-0">
			<Tabs.List
				class="border-line fixed bottom-5 left-4 z-40 h-14 w-auto gap-1 rounded-2xl border bg-paper-strong/95 p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.22)] backdrop-blur-xl md:static md:h-11 md:w-full md:rounded-xl md:bg-[#f2eee7] md:p-1 md:shadow-none md:backdrop-blur-none md:dark:bg-[#17130f]"
				aria-label="Dashboard sections"
			>
				<Tabs.Trigger
					value="identity"
					class="size-11 flex-none rounded-xl px-0 data-active:bg-white data-active:text-black md:h-full md:flex-1 md:px-4 dark:data-active:bg-[#0A0A0A] dark:data-active:text-[#FAFAFA] data-active:[&_svg]:text-black dark:data-active:[&_svg]:text-[#FAFAFA]"
					aria-label="Identity"
					title="Identity"
				>
					<KeyRound class="size-5" />
					<span class="max-md:sr-only">Identity</span>
				</Tabs.Trigger>
				<Tabs.Trigger
					value="apps"
					class="size-11 flex-none rounded-xl px-0 data-active:bg-white data-active:text-black md:h-full md:flex-1 md:px-4 dark:data-active:bg-[#0A0A0A] dark:data-active:text-[#FAFAFA] data-active:[&_svg]:text-black dark:data-active:[&_svg]:text-[#FAFAFA]"
					aria-label="Connected apps"
					title="Connected apps"
				>
					<Plug class="size-5" />
					<span class="max-md:sr-only">Apps</span>
				</Tabs.Trigger>
				<Tabs.Trigger
					value="security"
					class="size-11 flex-none rounded-xl px-0 data-active:bg-white data-active:text-black md:h-full md:flex-1 md:px-4 dark:data-active:bg-[#0A0A0A] dark:data-active:text-[#FAFAFA] data-active:[&_svg]:text-black dark:data-active:[&_svg]:text-[#FAFAFA]"
					aria-label="Security"
					title="Security"
				>
					<ShieldCheck class="size-5" />
					<span class="max-md:sr-only">Security</span>
				</Tabs.Trigger>
				<Tabs.Trigger
					value="help"
					class="size-11 flex-none rounded-xl px-0 data-active:bg-white data-active:text-black md:h-full md:flex-1 md:px-4 dark:data-active:bg-[#0A0A0A] dark:data-active:text-[#FAFAFA] data-active:[&_svg]:text-black dark:data-active:[&_svg]:text-[#FAFAFA]"
					aria-label="Help"
					title="Help"
				>
					<CircleHelp class="size-5" />
					<span class="max-md:sr-only">Help</span>
				</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="identity" class="mt-6">
				<Card>
					<CardHeader>
						<div
							class="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"
						>
							<CardTitle class="flex items-center gap-2">
								<KeyRound class="size-5 text-mint-deep" /> Identity
							</CardTitle>
							<Badge
								class="w-full justify-start gap-2 rounded-lg bg-mint/15 px-3 py-2 text-mint-deep sm:w-auto sm:rounded-full sm:py-1"
							>
								<span class="relative flex size-2.5 items-center justify-center">
									<span class="absolute size-2.5 animate-ping rounded-full bg-mint/35"></span>
									<span class="relative size-1.5 rounded-full bg-mint"></span>
								</span>
								Key unlocked
							</Badge>
						</div>
						<CardDescription
							>Your public ID (npub). Share it freely — it can't sign anything.</CardDescription
						>
					</CardHeader>
					<CardContent class="flex flex-col gap-3">
						<div class="flex items-stretch gap-2">
							<code
								class="border-line flex min-h-12 flex-1 items-center rounded-lg border bg-muted p-2.5 font-mono text-xs break-all"
								>{keyholder.npub}</code
							>
							<Button
								variant="outline"
								size="icon"
								class="h-auto min-h-12 self-stretch"
								onclick={copyNpub}
								aria-label="Copy npub"
							>
								{#if copiedNpub}
									<Check class="size-4 text-mint-deep" />
								{:else}
									<Copy class="size-4" />
								{/if}
							</Button>
						</div>
						<div class="flex flex-col gap-2">
							<Button
								variant="outline"
								class="border-line w-full justify-center rounded-lg bg-transparent text-foreground hover:bg-black/[0.035] dark:hover:bg-white/[0.06]"
								onclick={lock}><Lock class="size-4" /> Lock key</Button
							>
							<span class="text-xs text-muted-foreground">
								The key lives only in a sealed-off part of your browser and auto-locks after ~30 min
								idle.
							</span>
						</div>
					</CardContent>
				</Card>
			</Tabs.Content>

			<Tabs.Content value="apps" class="mt-6">
				<BunkerPanel />
			</Tabs.Content>

			<Tabs.Content value="security" class="mt-6">
				<div class="flex flex-col gap-4">
					<!-- Back up key -->
					<Card>
						<CardHeader>
							<CardTitle class="flex items-center gap-2">
								<Download class="size-5" /> Back up your key
							</CardTitle>
							<CardDescription class="text-foreground/58">
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
			</Tabs.Content>

			<Tabs.Content value="help" class="mt-6">
				<div class="flex flex-col gap-4">
					<Card>
						<CardHeader>
							<CardTitle class="flex items-center gap-2">
								<CircleHelp class="size-5 text-mint-deep" /> Using your key with Nostr apps
							</CardTitle>
							<CardDescription>
								A bunker lets another app request signatures without ever receiving your private
								key.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<ol class="grid gap-4 sm:grid-cols-3">
								<li class="border-line rounded-xl border bg-[#f5f1ea] p-4 dark:bg-[#17130f]">
									<span class="text-xs font-bold text-mint-deep">01</span>
									<p class="mt-3 font-semibold">Open Apps</p>
									<p class="mt-1 text-xs leading-relaxed text-foreground/58">
										Choose whether you are creating a bunker link or using one supplied by an app.
									</p>
								</li>
								<li class="border-line rounded-xl border bg-[#f5f1ea] p-4 dark:bg-[#17130f]">
									<span class="text-xs font-bold text-mint-deep">02</span>
									<p class="mt-3 font-semibold">Connect</p>
									<p class="mt-1 text-xs leading-relaxed text-foreground/58">
										Copy the connection link into the Nostr app's remote-signer or bunker field.
									</p>
								</li>
								<li class="border-line rounded-xl border bg-[#f5f1ea] p-4 dark:bg-[#17130f]">
									<span class="text-xs font-bold text-mint-deep">03</span>
									<p class="mt-3 font-semibold">Approve</p>
									<p class="mt-1 text-xs leading-relaxed text-foreground/58">
										Keep this tab open and approve signing requests as they arrive.
									</p>
								</li>
							</ol>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle class="text-base">A useful rule of thumb</CardTitle>
							<CardDescription class="text-foreground/58">
								Leave per-request approval on until you know and trust an app. Trusting an app
								allows it to sign automatically while this key remains unlocked.
							</CardDescription>
						</CardHeader>
					</Card>
				</div>
			</Tabs.Content>
		</Tabs.Root>
	{/if}
</div>
