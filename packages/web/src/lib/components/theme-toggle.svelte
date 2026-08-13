<script lang="ts">
	// Icon swap is pure CSS via the .dark ancestor (managed by ModeWatcher) —
	// no reactive mode state needed. toggleMode flips light <-> dark.
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import { toggleMode } from 'mode-watcher';
	import { Button } from '$lib/components/ui/button';
</script>

<Button variant="ghost" size="icon" onclick={toggleMode}>
	<Sun class="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
	<Moon class="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
	<span class="sr-only">Toggle theme</span>
</Button>
