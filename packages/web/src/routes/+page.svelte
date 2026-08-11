<script lang="ts">
	// Landing: the two entry points of the custody-free loop.
</script>

<h1>Your Nostr key, everywhere. Not held by anyone.</h1>

<p>
		keys.justworks stores your encrypted key (<code>ncryptsec</code>) on a server
		that <strong>cannot decrypt it</strong> and <strong>cannot link it to your
		identity</strong>. You retrieve and decrypt it on any device with your
		identifier and password.
</p>

<p>
		<strong>There is no recovery.</strong> Lose your identifier or password and the
		key is gone — that's the trade for non-custodial availability.
</p>

<div class="actions">
	<a class="btn primary" href="/register">Create a key</a>
	<a class="btn" href="/login">Log in</a>
</div>

<style>
	h1 {
		font-size: 1.6rem;
		line-height: 1.2;
	}
	code {
		background: #eee;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
		font-size: 0.9em;
	}
	.actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 2rem;
	}
	.btn {
		display: inline-block;
		padding: 0.6rem 1.1rem;
		border: 1px solid #ccc;
		border-radius: 6px;
		text-decoration: none;
		color: inherit;
		background: #fff;
	}
	.btn.primary {
		background: #1a1a1a;
		color: #fff;
		border-color: #1a1a1a;
	}
</style>
