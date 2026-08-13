<script lang="ts">
  import { onMount } from "svelte";
  import { send, shortNpub, type Status } from "../lib/ui";

  let identifier = $state("");
  let password = $state("");
  let status = $state<Status | null>(null);
  let npub = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);
  let copied = $state(false);

  async function refresh() {
    try {
      status = await send<Status>({ src: "ui", cmd: "status" });
      npub = status?.npub ?? "";
    } catch (e) {
      error = e instanceof Error ? e.message : "status failed";
    }
  }

  async function onUnlock(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    busy = true;
    try {
      await send({ src: "ui", cmd: "login", identifier, password });
      password = "";
      await refresh();
    } catch (err) {
      error = err instanceof Error ? err.message : "login failed";
    } finally {
      busy = false;
    }
  }

  async function lock() {
    await send({ src: "ui", cmd: "lock" });
    await refresh();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(npub);
      copied = true;
      setTimeout(() => (copied = false), 1200);
    } catch {
      /* clipboard may be blocked */
    }
  }

  function openOptions() {
    chrome.runtime.openOptionsPage();
  }

  onMount(refresh);
</script>

<div class="wrap">
  <h1>🔑 keys.justworks</h1>

  {#if status?.unlocked}
    <div class="card">
      <div class="head">
        <span class="dot"></span>
        <span class="muted">Unlocked</span>
      </div>
      <pre class="pk" title={npub}>{shortNpub(npub)}</pre>
      <button type="button" class="link copy" onclick={copy}>{copied ? "Copied" : "Copy npub"}</button>
    </div>
    <div class="row actions">
      <button onclick={openOptions}>Manage</button>
      <button class="primary" onclick={lock}>Lock</button>
    </div>
  {:else}
    <p class="muted sub">Unlock your key</p>
    <form onsubmit={onUnlock} class="form">
      <div>
        <label for="id">Identifier</label>
        <input id="id" bind:value={identifier} autocomplete="username" required />
      </div>
      <div>
        <label for="pw">Password</label>
        <input id="pw" type="password" bind:value={password} autocomplete="current-password" required />
      </div>
      {#if error}<p class="error">{error}</p>{/if}
      <button class="primary" type="submit" disabled={busy}>{busy ? "Unlocking…" : "Unlock"}</button>
    </form>
    <p class="muted foot">
      No key yet?
      <button type="button" class="link" onclick={openOptions}>Create one →</button>
    </p>
  {/if}
</div>

<style>
  .wrap {
    padding: 1rem;
    min-width: 240px;
  }
  .sub {
    margin: 0 0 0.5rem;
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.5rem;
  }
  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--mint);
    display: inline-block;
  }
  .pk {
    margin: 0 0 0.35rem;
    max-height: none;
  }
  .copy {
    font-size: 0.78rem;
  }
  .actions {
    margin-top: 0.75rem;
    justify-content: space-between;
  }
  .actions button {
    flex: 1;
  }
  .foot {
    margin: 0.75rem 0 0;
    font-size: 0.8rem;
  }
</style>
