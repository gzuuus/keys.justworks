<script lang="ts">
	import AppWindow from '@lucide/svelte/icons/app-window';
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import MousePointer2 from '@lucide/svelte/icons/mouse-pointer-2';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
</script>

<section class="walkthrough" aria-labelledby="bunker-demo-title">
	<div class="walkthrough__heading">
		<div>
			<p class="walkthrough__eyebrow">Animated walkthrough</p>
			<h3 id="bunker-demo-title">From connection link to signed event</h3>
		</div>
		<p>Name it, copy it, paste it, then approve only what you expect.</p>
	</div>

	<div class="walkthrough__steps" aria-hidden="true">
		<div class="walkthrough__step walkthrough__step--one">
			<span>01</span><strong>Create &amp; copy</strong>
		</div>
		<div class="walkthrough__step walkthrough__step--two">
			<span>02</span><strong>Paste &amp; connect</strong>
		</div>
		<div class="walkthrough__step walkthrough__step--three">
			<span>03</span><strong>Review &amp; approve</strong>
		</div>
	</div>

	<div class="walkthrough__stage" aria-hidden="true">
		<article class="mock mock--keys">
			<header class="mock__bar">
				<span class="mock__brand"><KeyRound /> keys.justworks</span>
				<span class="mock__location">Apps</span>
			</header>
			<div class="mock__body">
				<div class="mock__slot-head">
					<span class="mock__avatar">P</span>
					<div><strong>Primal on my phone</strong><small>Listening for connection</small></div>
				</div>
				<p class="mock__label">Connection link</p>
				<div class="mock__link">
					<code>bunker://7c91…@relay.example</code>
					<span class="mock__copy"><Copy /><i>Copy</i><b><Check /> Copied</b></span>
				</div>
				<p class="mock__hint">The app never receives your private key.</p>
			</div>

			<div class="request">
				<div class="request__icon"><ShieldCheck /></div>
				<div class="request__copy">
					<small>Signing request</small>
					<strong>Publish a note</strong>
					<span>Primal on my phone · kind 1</span>
				</div>
				<span class="request__approve">Approve</span>
				<span class="request__done"><Check /> Signed</span>
			</div>
		</article>

		<div class="walkthrough__bridge"><span></span></div>

		<article class="mock mock--app">
			<header class="mock__bar">
				<span class="mock__brand"><AppWindow /> Nostr app</span>
				<span class="mock__location">Settings</span>
			</header>
			<div class="mock__body">
				<p class="mock__section-title">Remote signer</p>
				<p class="mock__description">Use your key without importing it into this app.</p>
				<p class="mock__label">Bunker connection</p>
				<div class="mock__input">
					<span class="mock__placeholder">Paste bunker:// link</span>
					<code class="mock__pasted">bunker://7c91…@relay.example</code>
				</div>
				<span class="mock__connect">Connect</span>
				<span class="mock__connected"><Check /> Connected through keys.justworks</span>
			</div>
		</article>

		<div class="walkthrough__cursor"><MousePointer2 /><span></span></div>
	</div>

	<p class="sr-only">
		The demonstration creates and copies a bunker link in keys.justworks, pastes it into a Nostr
		app, then returns to keys.justworks to review and approve a signing request.
	</p>
</section>

<style>
	.walkthrough {
		margin: 0;
	}
	.walkthrough__heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1.5rem;
	}
	.walkthrough__heading h3 {
		margin: 0.35rem 0 0;
		font-size: clamp(1.05rem, 2vw, 1.35rem);
		font-weight: 750;
		letter-spacing: -0.035em;
	}
	.walkthrough__heading > p {
		max-width: 25rem;
		margin: 0;
		color: var(--muted-foreground);
		font-size: 0.75rem;
		line-height: 1.5;
	}
	.walkthrough__eyebrow {
		margin: 0;
		color: var(--mint-deep);
		font-size: 0.63rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.walkthrough__steps {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
		margin-top: 1.25rem;
	}
	.walkthrough__step {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
		border: 1px solid var(--line);
		background: var(--muted);
		padding: 0.65rem 0.75rem;
		color: var(--muted-foreground);
		font-size: 0.7rem;
		transition: none;
	}
	.walkthrough__step span {
		color: var(--mint-deep);
		font-family: monospace;
		font-size: 0.61rem;
		font-weight: 800;
	}
	.walkthrough__step strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.walkthrough__step--one {
		animation: active-one 12s infinite;
	}
	.walkthrough__step--two {
		animation: active-two 12s infinite;
	}
	.walkthrough__step--three {
		animation: active-three 12s infinite;
	}

	.walkthrough__stage {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 2.5rem minmax(0, 1fr);
		align-items: stretch;
		min-height: 23rem;
		margin-top: 0.75rem;
		overflow: hidden;
		border: 1px solid var(--line);
		background:
			linear-gradient(var(--line) 1px, transparent 1px),
			linear-gradient(90deg, var(--line) 1px, transparent 1px), var(--paper);
		background-size: 2rem 2rem;
		padding: clamp(0.75rem, 2vw, 1.5rem);
	}
	.mock {
		position: relative;
		align-self: center;
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--line);
		background: color-mix(in srgb, var(--card) 96%, transparent);
		box-shadow: 0 1.2rem 3rem rgb(0 0 0 / 0.08);
	}
	.mock__bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border-bottom: 1px solid var(--line);
		padding: 0.75rem 0.85rem;
	}
	.mock__brand {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.69rem;
		font-weight: 750;
	}
	.mock__brand :global(svg) {
		width: 0.9rem;
		height: 0.9rem;
		color: var(--mint-deep);
	}
	.mock__location {
		color: var(--muted-foreground);
		font-size: 0.6rem;
	}
	.mock__body {
		padding: clamp(0.85rem, 2vw, 1.15rem);
	}
	.mock__slot-head {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		margin-bottom: 1rem;
	}
	.mock__avatar {
		display: grid;
		width: 2rem;
		height: 2rem;
		place-items: center;
		background: #c45b13;
		color: #fff8ef;
		font-size: 0.75rem;
		font-weight: 850;
	}
	.mock__slot-head div {
		display: flex;
		min-width: 0;
		flex-direction: column;
	}
	.mock__slot-head strong,
	.mock__section-title {
		margin: 0;
		font-size: 0.73rem;
		font-weight: 750;
	}
	.mock__slot-head small {
		color: var(--muted-foreground);
		font-size: 0.58rem;
	}
	.mock__label {
		display: block;
		margin: 0 0 0.35rem;
		color: var(--muted-foreground);
		font-size: 0.58rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.mock__link,
	.mock__input {
		display: flex;
		min-height: 2.65rem;
		align-items: center;
		border: 1px solid var(--line);
		background: var(--muted);
		font-size: 0.58rem;
	}
	.mock__link code {
		min-width: 0;
		flex: 1;
		overflow: hidden;
		padding: 0 0.7rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mock__copy {
		position: relative;
		display: inline-flex;
		min-width: 4.15rem;
		align-self: stretch;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		border-left: 1px solid var(--line);
		background: var(--foreground);
		color: var(--background);
		font-style: normal;
		font-weight: 750;
	}
	.mock__copy :global(svg) {
		width: 0.7rem;
		height: 0.7rem;
	}
	.mock__copy i {
		font-style: normal;
	}
	.mock__copy b {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		background: var(--foreground);
		opacity: 0;
		animation: copied 12s infinite;
	}
	.mock__hint,
	.mock__description {
		margin: 0.65rem 0 0;
		color: var(--muted-foreground);
		font-size: 0.58rem;
		line-height: 1.45;
	}
	.mock__section-title {
		margin-bottom: 0.25rem;
	}
	.mock__description {
		margin: 0 0 1rem;
	}
	.mock__input {
		position: relative;
		padding: 0 0.7rem;
		overflow: hidden;
	}
	.mock__placeholder {
		color: var(--muted-foreground);
		animation: placeholder 12s infinite;
	}
	.mock__pasted {
		position: absolute;
		inset: auto 0.7rem;
		overflow: hidden;
		opacity: 0;
		text-overflow: ellipsis;
		white-space: nowrap;
		animation: pasted 12s infinite;
	}
	.mock__connect {
		display: flex;
		width: 100%;
		min-height: 2.55rem;
		align-items: center;
		justify-content: center;
		margin-top: 0.65rem;
		background: var(--foreground);
		color: var(--background);
		font-size: 0.65rem;
		font-weight: 750;
	}
	.mock__connected {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin-top: 0.7rem;
		color: #727919;
		font-size: 0.59rem;
		font-weight: 750;
		opacity: 0;
		animation: connected 12s infinite;
	}
	.mock__connected :global(svg) {
		width: 0.75rem;
		height: 0.75rem;
	}
	.walkthrough__bridge {
		display: grid;
		place-items: center;
	}
	.walkthrough__bridge span {
		width: 100%;
		border-top: 1px dashed var(--mint-deep);
		opacity: 0.55;
	}
	.request {
		position: absolute;
		inset: auto 0.75rem 0.75rem;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.65rem;
		border: 1px solid color-mix(in srgb, var(--mint-deep) 45%, var(--line));
		background: var(--card);
		padding: 0.7rem;
		box-shadow: 0 1rem 2.5rem rgb(0 0 0 / 0.18);
		opacity: 0;
		transform: translateY(1rem);
		animation: request 12s infinite;
	}
	.request__icon {
		display: grid;
		width: 1.8rem;
		height: 1.8rem;
		place-items: center;
		background: var(--muted);
		color: var(--mint-deep);
	}
	.request__icon :global(svg) {
		width: 0.95rem;
		height: 0.95rem;
	}
	.request__copy {
		display: flex;
		min-width: 0;
		flex-direction: column;
	}
	.request__copy small,
	.request__copy span {
		color: var(--muted-foreground);
		font-size: 0.5rem;
	}
	.request__copy strong {
		font-size: 0.65rem;
	}
	.request__approve,
	.request__done {
		min-width: 4rem;
		background: var(--foreground);
		color: var(--background);
		padding: 0.55rem;
		text-align: center;
		font-size: 0.58rem;
		font-weight: 800;
	}
	.request__approve {
		animation: approved-button 12s infinite;
	}
	.request__done {
		position: absolute;
		right: 0.7rem;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		background: #727919;
		color: #fff;
		opacity: 0;
		animation: signed 12s infinite;
	}
	.request__done :global(svg) {
		width: 0.7rem;
		height: 0.7rem;
	}
	.walkthrough__cursor {
		position: absolute;
		z-index: 8;
		left: 42%;
		top: 50%;
		filter: drop-shadow(0 2px 2px rgb(0 0 0 / 0.3));
		animation: cursor-desktop 12s infinite;
	}
	.walkthrough__cursor :global(svg) {
		width: 1.25rem;
		height: 1.25rem;
		fill: var(--card);
		color: var(--foreground);
	}
	.walkthrough__cursor span {
		position: absolute;
		left: -0.45rem;
		top: -0.45rem;
		width: 2rem;
		height: 2rem;
		border: 1px solid var(--mint-deep);
		border-radius: 50%;
		opacity: 0;
		animation: click-ring 12s infinite;
	}

	@keyframes active-one {
		0%,
		30% {
			background: var(--foreground);
			color: var(--background);
			border-color: var(--foreground);
		}
		34%,
		100% {
			background: var(--muted);
			color: var(--muted-foreground);
			border-color: var(--line);
		}
	}
	@keyframes active-two {
		0%,
		31%,
		65%,
		100% {
			background: var(--muted);
			color: var(--muted-foreground);
			border-color: var(--line);
		}
		35%,
		62% {
			background: var(--foreground);
			color: var(--background);
			border-color: var(--foreground);
		}
	}
	@keyframes active-three {
		0%,
		64% {
			background: var(--muted);
			color: var(--muted-foreground);
			border-color: var(--line);
		}
		68%,
		100% {
			background: var(--foreground);
			color: var(--background);
			border-color: var(--foreground);
		}
	}
	@keyframes copied {
		0%,
		13%,
		30%,
		100% {
			opacity: 0;
		}
		16%,
		27% {
			opacity: 1;
		}
	}
	@keyframes placeholder {
		0%,
		35% {
			opacity: 1;
		}
		39%,
		100% {
			opacity: 0;
		}
	}
	@keyframes pasted {
		0%,
		35% {
			opacity: 0;
			transform: translateY(0.35rem);
		}
		40%,
		100% {
			opacity: 1;
			transform: translateY(0);
		}
	}
	@keyframes connected {
		0%,
		51% {
			opacity: 0;
			transform: translateY(0.3rem);
		}
		56%,
		100% {
			opacity: 1;
			transform: translateY(0);
		}
	}
	@keyframes request {
		0%,
		64% {
			opacity: 0;
			transform: translateY(1rem);
		}
		69%,
		100% {
			opacity: 1;
			transform: translateY(0);
		}
	}
	@keyframes approved-button {
		0%,
		84% {
			opacity: 1;
		}
		88%,
		100% {
			opacity: 0;
		}
	}
	@keyframes signed {
		0%,
		84% {
			opacity: 0;
		}
		88%,
		100% {
			opacity: 1;
		}
	}
	@keyframes cursor-desktop {
		0%,
		5% {
			left: 41%;
			top: 49%;
			opacity: 0;
			transform: scale(1);
		}
		9%,
		13% {
			left: 42%;
			top: 50%;
			opacity: 1;
			transform: scale(1);
		}
		16% {
			left: 42%;
			top: 50%;
			opacity: 1;
			transform: scale(0.82);
		}
		20%,
		29% {
			left: 42%;
			top: 50%;
			opacity: 1;
			transform: scale(1);
		}
		39%,
		44% {
			left: 70%;
			top: 51%;
			opacity: 1;
			transform: scale(1);
		}
		47% {
			left: 70%;
			top: 51%;
			opacity: 1;
			transform: scale(0.82);
		}
		52%,
		63% {
			left: 70%;
			top: 51%;
			opacity: 1;
			transform: scale(1);
		}
		72%,
		80% {
			left: 39%;
			top: 71%;
			opacity: 1;
			transform: scale(1);
		}
		84% {
			left: 39%;
			top: 71%;
			opacity: 1;
			transform: scale(0.82);
		}
		89%,
		96% {
			left: 39%;
			top: 71%;
			opacity: 1;
			transform: scale(1);
		}
		100% {
			left: 39%;
			top: 71%;
			opacity: 0;
			transform: scale(1);
		}
	}
	@keyframes click-ring {
		0%,
		14%,
		18%,
		45%,
		49%,
		82%,
		87%,
		100% {
			opacity: 0;
			transform: scale(0.55);
		}
		16%,
		47%,
		84% {
			opacity: 0.7;
			transform: scale(1);
		}
	}

	@media (max-width: 680px) {
		.walkthrough__heading {
			align-items: start;
			flex-direction: column;
			gap: 0.55rem;
		}
		.walkthrough__steps {
			grid-template-columns: 1fr;
		}
		.walkthrough__step {
			min-height: 2.55rem;
		}
		.walkthrough__stage {
			grid-template-columns: 1fr;
			gap: 1rem;
			min-height: 41rem;
			padding: 0.75rem;
		}
		.mock {
			align-self: stretch;
		}
		.mock--keys {
			grid-row: 1;
		}
		.mock--app {
			grid-row: 3;
		}
		.walkthrough__bridge {
			grid-row: 2;
			min-height: 1rem;
		}
		.walkthrough__bridge span {
			width: 1px;
			height: 100%;
			border-top: 0;
			border-left: 1px dashed var(--mint-deep);
		}
		.walkthrough__cursor {
			animation-name: cursor-mobile;
		}
		.request {
			grid-template-columns: auto minmax(0, 1fr);
		}
		.request__approve,
		.request__done {
			grid-column: 1 / -1;
			width: 100%;
		}
		.request__done {
			position: static;
		}
		@keyframes cursor-mobile {
			0%,
			5% {
				left: 84%;
				top: 25%;
				opacity: 0;
				transform: scale(1);
			}
			9%,
			13% {
				left: 84%;
				top: 25%;
				opacity: 1;
				transform: scale(1);
			}
			16% {
				left: 84%;
				top: 25%;
				opacity: 1;
				transform: scale(0.82);
			}
			20%,
			29% {
				left: 84%;
				top: 25%;
				opacity: 1;
				transform: scale(1);
			}
			39%,
			44% {
				left: 42%;
				top: 72%;
				opacity: 1;
				transform: scale(1);
			}
			47% {
				left: 42%;
				top: 72%;
				opacity: 1;
				transform: scale(0.82);
			}
			52%,
			63% {
				left: 42%;
				top: 72%;
				opacity: 1;
				transform: scale(1);
			}
			72%,
			80% {
				left: 71%;
				top: 43%;
				opacity: 1;
				transform: scale(1);
			}
			84% {
				left: 71%;
				top: 43%;
				opacity: 1;
				transform: scale(0.82);
			}
			89%,
			96% {
				left: 71%;
				top: 43%;
				opacity: 1;
				transform: scale(1);
			}
			100% {
				left: 71%;
				top: 43%;
				opacity: 0;
				transform: scale(1);
			}
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.walkthrough__step,
		.mock__copy b,
		.mock__placeholder,
		.mock__pasted,
		.mock__connected,
		.request,
		.request__approve,
		.request__done,
		.walkthrough__cursor,
		.walkthrough__cursor span {
			animation: none;
		}
		.walkthrough__step--three {
			background: var(--foreground);
			color: var(--background);
			border-color: var(--foreground);
		}
		.mock__placeholder,
		.request__approve,
		.walkthrough__cursor {
			display: none;
		}
		.mock__pasted,
		.mock__connected,
		.request,
		.request__done {
			opacity: 1;
			transform: none;
		}
	}
</style>
