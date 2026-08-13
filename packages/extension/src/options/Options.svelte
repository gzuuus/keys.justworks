<script lang="ts">
  import { onMount } from "svelte";
  import type { BgReply } from "../lib/protocol";
  import { PERMISSION_NAMES, type NostrMethod } from "../lib/protocol";
  import type { PermissionEntry } from "../lib/permissions";

  type Status = { unlocked: boolean; npub: string | null };
  interface KjConfig {
    apiBase: string;
  }
  type Mode = "create" | "import";

  let status = $state<Status | null>(null);
  let cfg = $state<KjConfig | null>(null);
  let apiBaseInput = $state("");
  let perms = $state<PermissionEntry[]>([]);

  // Onboarding form state.
  let mode = $state<Mode>("create");
  let identifier = $state("");
  let password = $state("");
  let confirm = $state("");
  let nsec = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);
  // One-time backup reveal after a successful create (design: one-time export).
  let backup = $state<{ npub: string; nsec: string } | null>(null);
  let imported = $state<{ npub: string } | null>(null);
  let savedFlash = $state<string | null>(null);

  async function send<T>(msg: unknown): Promise<T> {
    const r = (await chrome.runtime.sendMessage(msg)) as BgReply<T>;
    if (!r.ok) throw new Error(r.error);
    return r.result;
  }

  async function refresh() {
    try {
      status = await send<Status>({ src: "ui", cmd: "status" });
      cfg = await send<KjConfig>({ src: "ui", cmd: "getConfig" });
      apiBaseInput = cfg.apiBase;
      perms = await send<PermissionEntry[]>({ src: "ui", cmd: "listPermissions" });
    } catch {
      /* SW may be mid-startup */
    }
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    if (!identifier || !password) {
      error = "Identifier and password are required.";
      return;
    }
    if (mode === "create" && password !== confirm) {
      error = "Passwords do not match.";
      return;
    }
    if (mode === "import" && !nsec.trim()) {
      error = "Paste your nsec to import.";
      return;
    }
    busy = true;
    try {
      if (mode === "create") {
        backup = await send<{ npub: string; nsec: string }>({
          src: "ui",
          cmd: "create",
          identifier,
          password,
        });
      } else {
        imported = await send<{ npub: string }>({
          src: "ui",
          cmd: "importKey",
          nsec: nsec.trim(),
          identifier,
          password,
        });
      }
      identifier = "";
      password = "";
      confirm = "";
      nsec = "";
      await refresh();
    } catch (err) {
      error = err instanceof Error ? err.message : "onboarding failed";
    } finally {
      busy = false;
    }
  }

  async function saveConfig() {
    cfg = await send<KjConfig>({ src: "ui", cmd: "setConfig", apiBase: apiBaseInput });
    savedFlash = "saved";
    setTimeout(() => (savedFlash = null), 1500);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard may be blocked in the options page */
    }
  }

  function dismissBackup() {
    backup = null;
  }

  async function revoke(host: string, accept: boolean, method: NostrMethod) {
    await send({ src: "ui", cmd: "removePermission", host, accept, method });
    await refresh();
  }

  onMount(refresh);
</script>

<div style="max-width: 640px; margin: 2rem auto; padding: 0 1rem">
  <h1>🔑 keys.justworks — manage</h1>

  {#if backup}
    <section
      style="border: 1px solid var(--sun); background: rgba(251,191,36,0.08); border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem"
    >
      <h2 style="color: var(--sun); margin-bottom: 0.5rem">Save your backup key</h2>
      <p class="muted" style="margin: 0 0 0.5rem">
        This is shown <strong>once</strong>. Store it in a password manager or offline. There is no
        recovery — losing both your identifier and password means losing the account.
      </p>
      <p class="muted" style="font-size: 0.8rem; margin: 0 0 0.25rem">Public key (npub — safe to share)</p>
      <pre>{backup.npub}</pre>
      <div class="row" style="margin: 0.25rem 0 0.75rem">
        <button onclick={() => copy(backup!.npub)}>Copy npub</button>
      </div>
      <p style="color: var(--sun); font-size: 0.8rem; margin: 0.5rem 0 0.25rem">Secret key (nsec — never share)</p>
      <pre style="border-color: var(--sun)">{backup.nsec}</pre>
      <div class="row" style="margin-top: 0.5rem; justify-content: space-between">
        <button onclick={() => copy(backup!.nsec)}>Copy nsec</button>
        <button class="primary" onclick={dismissBackup}>I've saved it</button>
      </div>
    </section>
  {/if}

  <section style="margin-bottom: 2rem">
    <h2>Status</h2>
    {#if status?.unlocked}
      <p>Unlocked — <span class="muted">{status.npub?.slice(0, 20)}…</span></p>
    {:else}
      <p class="muted">Locked. Unlock from the toolbar popup, or create/import a key below.</p>
    {/if}
    {#if imported}
      <p style="color: var(--mint)">Imported: <span class="muted">{imported.npub.slice(0, 20)}…</span></p>
    {/if}
  </section>

  <section style="margin-bottom: 2rem">
    <h2>Onboarding</h2>
    <div class="row" style="margin-bottom: 0.75rem">
      <button class:primary={mode === "create"} onclick={() => (mode = "create")}>
        Create new key
      </button>
      <button class:primary={mode === "import"} onclick={() => (mode = "import")}>
        Import nsec
      </button>
    </div>

    <form onsubmit={submit} style="display: flex; flex-direction: column; gap: 0.6rem">
      {#if mode === "import"}
        <div>
          <label for="nsec">Existing nsec</label>
          <textarea id="nsec" bind:value={nsec} rows="2" autocomplete="off" placeholder="nsec1…"></textarea>
        </div>
      {/if}
      <div>
        <label for="id">Identifier</label>
        <input id="id" bind:value={identifier} autocomplete="username" required />
      </div>
      <div>
        <label for="pw">Password</label>
        <input id="pw" type="password" bind:value={password} autocomplete="new-password" required />
      </div>
      {#if mode === "create"}
        <div>
          <label for="cf">Confirm password</label>
          <input id="cf" type="password" bind:value={confirm} autocomplete="new-password" required />
        </div>
      {/if}
      {#if error}<p class="error">{error}</p>{/if}
      <div>
        <button class="primary" type="submit" disabled={busy}>
          {busy ? "Working…" : mode === "create" ? "Create key" : "Import key"}
        </button>
      </div>
    </form>
    <p class="muted" style="font-size: 0.78rem; margin-top: 0.5rem">
      The key is generated and encrypted in the extension's isolated context; the server only ever
      stores the encrypted blob. Your identifier and password never leave this device except as
      one-way hashes / a memory-hard secret.
    </p>
  </section>

  <section style="margin-bottom: 2rem">
    <h2>Server (API base)</h2>
    <p class="muted" style="margin-top: 0">
      Where your encrypted key is fetched from. Self-hosters override this; default is the
      keys.justworks server. For local dev use <code>http://localhost:3000/api</code>.
    </p>
    <div class="row" style="align-items: flex-end">
      <div style="flex: 1">
        <label for="api">API base URL</label>
        <input id="api" bind:value={apiBaseInput} placeholder="https://keys.justworks.cash/api" />
      </div>
      <button class="primary" onclick={saveConfig}>Save</button>
    </div>
    {#if savedFlash}<p style="color: var(--mint); margin: 0.5rem 0 0">{savedFlash}</p>{/if}
  </section>

  <section>
    <h2>Site permissions</h2>
    {#if perms.length === 0}
      <p class="muted">No sites have been granted access yet.</p>
    {:else}
      <table style="width: 100%; border-collapse: collapse">
        <tbody>
          {#each perms as p (p.host + p.method + String(p.accept))}
            <tr>
              <td style="padding: 0.4rem 0; border-bottom: 1px solid var(--line)">
                <div>{p.host}</div>
                <div class="muted" style="font-size: 0.78rem">
                  {p.accept ? "✓" : "✗"} {PERMISSION_NAMES[p.method]}
                  {#if p.conditions?.kinds}
                    (kind {Object.keys(p.conditions.kinds).join(", ")})
                  {/if}
                </div>
              </td>
              <td style="text-align: right; border-bottom: 1px solid var(--line)">
                <button onclick={() => revoke(p.host, p.accept, p.method)}>Revoke</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
</div>
