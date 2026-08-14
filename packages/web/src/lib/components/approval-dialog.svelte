<!--
	keys.justworks — global NIP-46 approval dialog.

	Renders the front of the bunker singleton's approval queue from any page (it
	lives in the root layout so a connected client's request can be approved no
	matter where you are). Remember-duration grants persist via the bunker runtime.
-->
<script lang="ts">
	import { bunker } from '$lib/bunker/bunkers.svelte';
	import { bunkerApps, displayName } from '$lib/bunker/apps.svelte';
	import { short } from '$lib/bunker/policy';
	import {
		Dialog,
		DialogContent,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { ToggleGroup, ToggleGroupItem } from '$lib/components/ui/toggle-group';
	import type { Duration } from '$lib/bunker/policy';

	let remember = $state<Duration>('once');
	// ToggleGroup's default on-state (bg-muted) reads as unselected against the
	// resting bg — make the active duration primary-colored.
	const DURATION_ON =
		'data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground';

	function appName(id: string): string {
		const app = bunkerApps.get(id);
		return app ? displayName(app) : 'An app';
	}
</script>

<Dialog
	open={bunker.dialogOpen}
	onOpenChange={(open) => {
		if (!open) bunker.decide(false);
	}}
>
	<DialogContent showCloseButton={false}>
		{#if bunker.pending[0]}
			{@const req = bunker.pending[0]}
			<DialogHeader>
				<DialogTitle>Approve {req.kind.replace('_', ' ')}?</DialogTitle>
			</DialogHeader>
			<div class="flex flex-col gap-2 text-sm">
				<p class="text-muted-foreground">{appName(req.appId)} · {req.summary}</p>
				<p class="font-mono text-xs text-muted-foreground">from app {short(req.client)}</p>
				{#if req.detail}
					<pre
						class="max-h-64 overflow-auto bg-muted p-2 font-mono text-xs break-all whitespace-pre-wrap">{req.detail}</pre>
				{/if}
			</div>
			<DialogFooter>
				<div class="flex w-full flex-col gap-3">
					<div class="flex items-center gap-2">
						<span class="text-xs text-muted-foreground">Remember</span>
						<ToggleGroup type="single" bind:value={remember} variant="outline" size="sm">
							<ToggleGroupItem value="once" class={DURATION_ON}>Once</ToggleGroupItem>
							<ToggleGroupItem value="5min" class={DURATION_ON}>5 min</ToggleGroupItem>
							<ToggleGroupItem value="1h" class={DURATION_ON}>1 hour</ToggleGroupItem>
							<ToggleGroupItem value="always" class={DURATION_ON}>Always</ToggleGroupItem>
						</ToggleGroup>
					</div>
					<div class="flex justify-end gap-2">
						<Button variant="outline" onclick={() => bunker.decide(false)}>Deny</Button>
						<Button
							onclick={() => {
								bunker.decide(true, remember);
								remember = 'once';
							}}>Allow</Button
						>
					</div>
				</div>
			</DialogFooter>
		{/if}
	</DialogContent>
</Dialog>
