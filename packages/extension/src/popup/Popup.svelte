<script lang="ts">
  import { onMount } from "svelte";
  import type { BgReply } from "../lib/protocol";

  type Status = { unlocked: boolean; npub: string | null };

  let identifier = $state("");
  let password = $state("");
  let status = $state<Status | null>(null);
  let npub = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function send<T>(msg: unknown): Promise<T> {
    const r = (await chrome.runtime.sendMessage(msg)) as BgReply<T>;
    if (!r.ok) throw new Error(r.error);
    return r.result;
  }

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

  function openOptions() {
    chrome.runtime.openOptionsPage();
  }

  onMount(refresh);
</script>

<div style="padding: 1rem">
  <h1>🔑 keys.justworks</h1>

  {#if status?.unlocked}
    <p class="muted" style="margin: 0 0 0.25rem">Unlocked</p>
    <pre>{npub.slice(0, 24)}…</pre>
    <div class="row" style="margin-top: 0.75rem">
      <button class="primary" onclick={lock}>Lock</button>
      <button onclick={openOptions}>Manage</button>
    </div>
  {:else}
    <p class="muted" style="margin: 0 0 0.5rem">Unlock your key</p>
    <form onsubmit={onUnlock} style="display: flex; flex-direction: column; gap: 0.6rem">
      <div>
        <label for="id">Identifier</label>
        <input id="id" bind:value={identifier} autocomplete="username" required />
      </div>
      <div>
        <label for="pw">Password</label>
        <input id="pw" type="password" bind:value={password} autocomplete="current-password" required />
      </div>
      {#if error}<p class="error">{error}</p>{/if}
      <button class="primary" type="submit" disabled={busy}>
        {busy ? "Unlocking…" : "Unlock"}
      </button>
    </form>
    <p class="muted" style="margin: 0.75rem 0 0; font-size: 0.8rem">
      No key yet?
      <button type="button" class="link" onclick={openOptions}>Create one →</button>
    </p>
  {/if}
</div>
