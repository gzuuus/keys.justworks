<script lang="ts">
  import { onMount } from "svelte";
  import { send, shortNpub, type Status } from "../lib/ui";
  import { isNewer, UPDATE_KEY, type UpdateInfo } from "../lib/update";
  import Logo from "../lib/Logo.svelte";
  import Profile from "../lib/Profile.svelte";

  let identifier = $state("");
  let password = $state("");
  let status = $state<Status | null>(null);
  let npub = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);
  let copied = $state(false);
  let update = $state<{ latest: string; url: string } | null>(null);

  async function refresh() {
    try {
      status = await send<Status>({ src: "ui", cmd: "status" });
      npub = status?.npub ?? "";
    } catch (e) {
      error = e instanceof Error ? e.message : "status failed";
    }
    // Update notice: written by the SW's periodic check of /extension/update.xml.
    const stored = (await chrome.storage.local.get(UPDATE_KEY))[UPDATE_KEY] as
      | UpdateInfo
      | null
      | undefined;
    if (stored && isNewer(stored.latest, chrome.runtime.getManifest().version)) {
      try {
        const cfg = await send<{ apiBase: string }>({ src: "ui", cmd: "getConfig" });
        update = { latest: stored.latest, url: `${new URL(cfg.apiBase).origin}/download` };
      } catch {
        update = null;
      }
    } else {
      update = null;
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

  /** Deep-link into the manage tab (e.g. "#create") — the popup is too small
   * and too short-lived (closes on blur) for onboarding flows. */
  function openManage(hash = "") {
    chrome.tabs.create({ url: chrome.runtime.getURL(`src/options/index.html${hash}`) });
  }

  onMount(refresh);
</script>

<div class="wrap">
  <header class="head">
    <Logo size={26} />
  </header>

  {#if update}
    <a class="update" href={update.url} target="_blank" rel="noopener noreferrer">
      <strong>v{update.latest} available</strong>
      <span>Download the new .crx, then drag it onto chrome://extensions.</span>
    </a>
  {/if}

  {#if status?.unlocked}
    <div class="card">
      <div class="state">
        <span class="dot"></span>
        <span class="muted">Unlocked</span>
      </div>
      <Profile npub={npub} fallback={shortNpub(npub)} size={30} />
      <button type="button" class="link copy" onclick={copy} title={npub}
        >{copied ? "Copied" : "Copy npub"}</button
      >
    </div>
    <div class="row actions">
      <button onclick={() => openManage()}>Manage</button>
      <button class="primary" onclick={lock}>Lock</button>
    </div>
  {:else}
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
      <button type="button" class="link" onclick={() => openManage("#create")}>Create one →</button>
    </p>
  {/if}
</div>

<style>
  .wrap {
    padding: 1rem;
    min-width: 288px;
  }
  .head {
    margin-bottom: 0.9rem;
  }
  .update {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin-bottom: 0.9rem;
    padding: 0.55rem 0.7rem;
    border-left: 3px solid #f59e0b;
    border-radius: 0.4rem;
    background: var(--secondary, #f5f5f4);
    font-size: 0.78rem;
    text-decoration: none;
    color: inherit;
  }
  .update span {
    opacity: 0.75;
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .state {
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
