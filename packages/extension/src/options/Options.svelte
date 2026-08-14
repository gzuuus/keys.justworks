<script lang="ts">
  import { onMount } from "svelte";
  import { send, shortNpub, type Status } from "../lib/ui";
  import { PERMISSION_NAMES, type NostrMethod } from "../lib/protocol";
  import type { PermissionEntry } from "../lib/permissions";
  import type { CachedAccount } from "../lib/accounts";
  import Logo from "../lib/Logo.svelte";

  interface KjConfig {
    apiBase: string;
  }
  type Mode = "create" | "import";

  let status = $state<Status | null>(null);
  let cfg = $state<KjConfig | null>(null);
  let apiBaseInput = $state("");
  let perms = $state<PermissionEntry[]>([]);
  let cached = $state<{ id: string; account: CachedAccount }[]>([]);

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

  // Unlock form state (the manage page doubles as the unlock surface — Chrome
  // opens it right after install, before any key exists locally).
  let unlockId = $state("");
  let unlockPw = $state("");
  let unlockBusy = $state(false);
  let unlockError = $state<string | null>(null);
  let npubCopied = $state(false);

  // Danger zone state.
  let cpIdentifier = $state("");
  let oldPassword = $state("");
  let newPassword = $state("");
  let newConfirm = $state("");
  let dangerBusy = $state(false);
  let dangerError = $state<string | null>(null);
  let pwChanged = $state(false);
  let exported = $state<{ npub: string; nsec: string } | null>(null);
  let eraseId = $state("");
  let erasePw = $state("");
  let eraseArmed = $state(false);
  let eraseBusy = $state(false);

  async function refresh() {
    try {
      status = await send<Status>({ src: "ui", cmd: "status" });
      cfg = await send<KjConfig>({ src: "ui", cmd: "getConfig" });
      apiBaseInput = cfg.apiBase;
      perms = await send<PermissionEntry[]>({ src: "ui", cmd: "listPermissions" });
      cached = await send<{ id: string; account: CachedAccount }[]>({ src: "ui", cmd: "cachedAccounts" });
    } catch {
      /* SW may be mid-startup */
    }
  }

  /** Deep links from the popup: #create / #import jump into onboarding,
   * #device / #server / #permissions / #danger scroll to that section. */
  function applyHash(hash: string) {
    if (hash === "#create" || hash === "#import") mode = hash.slice(1) as Mode;
    const id = ({ "#create": "onboarding", "#import": "onboarding" } as Record<string, string>)[hash] ?? hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function lockKey() {
    await send({ src: "ui", cmd: "lock" });
    await refresh();
  }

  async function unlockKey(e: SubmitEvent) {
    e.preventDefault();
    unlockError = null;
    unlockBusy = true;
    try {
      await send({ src: "ui", cmd: "login", identifier: unlockId, password: unlockPw });
      unlockPw = "";
      await refresh();
    } catch (err) {
      unlockError = err instanceof Error ? err.message : "unlock failed";
    } finally {
      unlockBusy = false;
    }
  }

  async function copyNpub() {
    try {
      await navigator.clipboard.writeText(status?.npub ?? "");
      npubCopied = true;
      setTimeout(() => (npubCopied = false), 1200);
    } catch {
      /* clipboard may be blocked */
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

  async function removeCached(id: string) {
    await send({ src: "ui", cmd: "removeCached", id });
    await refresh();
  }

  async function revoke(host: string, accept: boolean, method: NostrMethod) {
    await send({ src: "ui", cmd: "removePermission", host, accept, method });
    await refresh();
  }

  async function changePassword(e: SubmitEvent) {
    e.preventDefault();
    dangerError = null;
    pwChanged = false;
    if (!cpIdentifier || !oldPassword || !newPassword) {
      dangerError = "Identifier, current and new password are required.";
      return;
    }
    if (newPassword !== newConfirm) {
      dangerError = "New passwords do not match.";
      return;
    }
    dangerBusy = true;
    try {
      await send({
        src: "ui",
        cmd: "changePassword",
        identifier: cpIdentifier,
        password: oldPassword,
        newPassword,
      });
      oldPassword = "";
      newPassword = "";
      newConfirm = "";
      pwChanged = true;
      await refresh();
    } catch (err) {
      dangerError = err instanceof Error ? err.message : "could not change password";
    } finally {
      dangerBusy = false;
    }
  }

  async function exportNsec() {
    dangerError = null;
    try {
      exported = await send<{ npub: string; nsec: string }>({ src: "ui", cmd: "exportNsec" });
    } catch (err) {
      dangerError = err instanceof Error ? err.message : "could not export";
    }
  }

  async function erase(e: SubmitEvent) {
    e.preventDefault();
    dangerError = null;
    if (!eraseArmed) {
      eraseArmed = true; // first click arms; the coral confirm below actually erases
      return;
    }
    dangerBusy = true;
    try {
      await send({ src: "ui", cmd: "erase", identifier: eraseId, password: erasePw });
      eraseId = "";
      erasePw = "";
      eraseArmed = false;
      backup = null;
      exported = null;
      imported = null;
      await refresh();
    } catch (err) {
      dangerError = err instanceof Error ? err.message : "erase failed";
    } finally {
      dangerBusy = false;
    }
  }

  onMount(async () => {
    await refresh();
    applyHash(location.hash);
  });
</script>

<div class="page">
  <header class="hero card">
    <Logo size={34} />
    <span class="muted manage">manage</span>
    {#if status?.unlocked}
      <span class="chip ok"><span class="dot"></span>Unlocked</span>
    {:else}
      <span class="chip"><span class="dot locked"></span>Locked</span>
    {/if}
  </header>

  <section id="unlock" class="card">
    {#if status?.unlocked}
      <h2>Unlocked</h2>
      <div class="row" style="justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem">
        <pre style="margin: 0" title={status.npub ?? ""}>{shortNpub(status.npub ?? "")}</pre>
        <div class="row">
          <button onclick={copyNpub}>{npubCopied ? "Copied" : "Copy npub"}</button>
          <button class="primary" onclick={lockKey}>Lock</button>
        </div>
      </div>
    {:else}
      <h2>Unlock</h2>
      <p class="muted" style="margin-top: 0">
        Same identifier + password as the website. The encrypted key is fetched, decrypted, and
        held only in this extension's memory — the server still never sees it decrypted.
      </p>
      <form onsubmit={unlockKey} class="stack">
        <div>
          <label for="un-id">Identifier</label>
          <input id="un-id" bind:value={unlockId} autocomplete="username" required />
        </div>
        <div>
          <label for="un-pw">Password</label>
          <input id="un-pw" type="password" bind:value={unlockPw} autocomplete="current-password" required />
        </div>
        {#if unlockError}<p class="error">{unlockError}</p>{/if}
        <div>
          <button class="primary" type="submit" disabled={unlockBusy}>
            {unlockBusy ? "Unlocking…" : "Unlock"}
          </button>
        </div>
      </form>
    {/if}
  </section>

  {#if backup}
    <section
      class="card"
      style="border-color: var(--sun); background: rgba(247, 184, 75, 0.08); margin-bottom: 1.5rem"
    >
      <h2 style="color: var(--sun); margin-bottom: 0.5rem">Save your backup key</h2>
      <p class="muted" style="margin: 0 0 0.5rem">
        This is shown <strong>once</strong>. Store it in a password manager or offline. There is no
        recovery — losing both your identifier and password means losing the account.
      </p>
      <p class="muted small">Public key (npub — safe to share)</p>
      <pre>{backup.npub}</pre>
      <div class="row" style="margin: 0.25rem 0 0.75rem">
        <button onclick={() => copy(backup!.npub)}>Copy npub</button>
      </div>
      <p class="small" style="color: var(--sun); margin: 0.5rem 0 0.25rem">Secret key (nsec — never share)</p>
      <pre style="border-color: var(--sun)">{backup.nsec}</pre>
      <div class="row" style="margin-top: 0.5rem; justify-content: space-between">
        <button onclick={() => copy(backup!.nsec)}>Copy nsec</button>
        <button class="primary" onclick={dismissBackup}>I've saved it</button>
      </div>
    </section>
  {/if}

  <section id="onboarding" class="card">
    <h2>{mode === "create" ? "Create a key" : "Import a key"}</h2>
    <div class="row" style="margin-bottom: 0.75rem">
      <button class:primary={mode === "create"} onclick={() => (mode = "create")}>
        Create new key
      </button>
      <button class:primary={mode === "import"} onclick={() => (mode = "import")}>
        Import nsec
      </button>
    </div>

    <form onsubmit={submit} class="stack">
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
    <p class="muted small" style="margin-top: 0.5rem">
      The key is generated and encrypted in the extension's isolated context; the server only ever
      stores the encrypted blob. Your identifier and password never leave this device except as
      one-way hashes / a memory-hard secret.
    </p>
  </section>

  <section id="device" class="card">
    <h2>On this device</h2>
    <p class="muted" style="margin-top: 0">
      Keys cached here unlock without a server round-trip (even offline). Only the encrypted blob
      and a one-way hash of your identifier are stored — never the identifier itself.
    </p>
    {#if cached.length === 0}
      <p class="muted">No keys cached on this device yet.</p>
    {:else}
      <ul class="devices">
        {#each cached as { id, account } (id)}
          <li>
            <div>
              <div class="label">
                {account.label}
                {#if status?.unlocked && status.npub === account.npub}
                  <span class="chip ok"><span class="dot"></span>active</span>
                {/if}
              </div>
              <div class="muted small">{shortNpub(account.npub)}</div>
            </div>
            <button onclick={() => removeCached(id)}>Remove</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section id="server" class="card">
    <h2>Server</h2>
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
    {#if savedFlash}<p style="color: var(--mint-deep); margin: 0.5rem 0 0">{savedFlash}</p>{/if}
  </section>

  <section id="permissions" class="card">
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
                <div class="muted small">
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

  <section id="danger" class="card" style="border-color: var(--coral)">
    <h2 style="color: var(--coral)">Danger zone</h2>
    {#if dangerError}<p class="error">{dangerError}</p>{/if}

    <h3>Change password</h3>
    {#if status?.unlocked}
      <form onsubmit={changePassword} class="stack">
        <div>
          <label for="cp-id">Identifier</label>
          <input id="cp-id" bind:value={cpIdentifier} autocomplete="username" required />
        </div>
        <div>
          <label for="cp-old">Current password</label>
          <input id="cp-old" type="password" bind:value={oldPassword} autocomplete="current-password" required />
        </div>
        <div>
          <label for="cp-new">New password</label>
          <input id="cp-new" type="password" bind:value={newPassword} autocomplete="new-password" required />
        </div>
        <div>
          <label for="cp-conf">Confirm new password</label>
          <input id="cp-conf" type="password" bind:value={newConfirm} autocomplete="new-password" required />
        </div>
        {#if pwChanged}<p style="color: var(--mint-deep)">Password changed.</p>{/if}
        <div>
          <button class="primary" type="submit" disabled={dangerBusy}>
            {dangerBusy ? "Working…" : "Change password"}
          </button>
        </div>
      </form>
    {:else}
      <p class="muted">Unlock from the toolbar popup first — the key must be in memory to re-wrap it.</p>
    {/if}

    <h3>Reveal secret key (nsec)</h3>
    {#if status?.unlocked}
      {#if exported}
        <p class="small" style="color: var(--sun); margin: 0.25rem 0">
          Treat this like a bank password — anyone holding it owns the identity.
        </p>
        <pre style="border-color: var(--sun)">{exported.nsec}</pre>
        <div class="row" style="margin: 0.5rem 0; justify-content: space-between">
          <button onclick={() => copy(exported!.nsec)}>Copy nsec</button>
          <button onclick={() => (exported = null)}>Hide</button>
        </div>
      {:else}
        <button onclick={exportNsec}>Reveal nsec</button>
      {/if}
    {:else}
      <p class="muted">Unlock from the toolbar popup first.</p>
    {/if}

    <h3>Erase account</h3>
    <p class="muted" style="margin-top: 0">
      Deletes the encrypted blob from the server and this device. There is no recovery — this
      permanently destroys the account unless you saved the nsec.
    </p>
    <form onsubmit={erase} class="stack">
      <div>
        <label for="er-id">Identifier</label>
        <input id="er-id" bind:value={eraseId} autocomplete="username" required />
      </div>
      <div>
        <label for="er-pw">Password</label>
        <input id="er-pw" type="password" bind:value={erasePw} autocomplete="current-password" required />
      </div>
      <div>
        {#if eraseArmed}
          <button class="danger" type="submit" disabled={eraseBusy}>
            {eraseBusy ? "Erasing…" : "Yes, erase everything — permanent"}
          </button>
          <button type="button" onclick={() => (eraseArmed = false)}>Cancel</button>
        {:else}
          <button type="submit" disabled={eraseBusy}>Erase…</button>
        {/if}
      </div>
    </form>
  </section>
</div>

<style>
  .page {
    max-width: 680px;
    margin: 2rem auto;
    padding: 0 1rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .hero {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .manage {
    font-size: 0.85rem;
    flex: 1;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.75rem;
    color: var(--muted-ink);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 0.15rem 0.6rem;
    white-space: nowrap;
  }
  .chip.ok {
    color: var(--mint-deep);
    border-color: var(--mint);
  }
  .dot {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--mint);
    display: inline-block;
  }
  .dot.locked {
    background: var(--muted-ink);
  }
  .small {
    font-size: 0.78rem;
    margin: 0.25rem 0;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .devices {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
  }
  .devices li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--line);
  }
  .devices li:last-child {
    border-bottom: none;
  }
  .label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  h3 {
    margin: 1.25rem 0 0.5rem;
    font-size: 1rem;
  }
  h3:first-of-type {
    margin-top: 0.5rem;
  }
</style>
