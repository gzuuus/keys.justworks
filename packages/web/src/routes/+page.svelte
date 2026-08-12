<script lang="ts">
	// Landing: the two entry points of the custody-free loop.
</script>

<h1 class="text-2xl leading-tight">Your Nostr key, everywhere. Not held by anyone.</h1>

<p class="mt-2">
	keys.justworks stores your encrypted key (<code>ncryptsec</code>) on a server that
	<strong>cannot decrypt it</strong>
	and <strong>cannot link it to your identity</strong>. You retrieve and decrypt it on any device
	with your identifier and password.
</p>

<p class="mt-3">
	<strong>There is no recovery.</strong> Lose your identifier or password and the key is gone — that's
	the trade for non-custodial availability.
</p>

<div class="mt-8 flex gap-3">
	<a
		class="rounded-md bg-neutral-900 px-4 py-2.5 text-base text-white no-underline"
		href="/register">Create a key</a
	>
	<a
		class="rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-base text-neutral-900 no-underline"
		href="/login">Log in</a
	>
</div>
