<script lang="ts">
  import { PERMISSION_NAMES, type NostrMethod } from "../lib/protocol";

  const qs = new URLSearchParams(location.search);
  const id = qs.get("id") ?? "";
  const host = qs.get("host") ?? "";
  const method = (qs.get("method") ?? "") as NostrMethod;
  const kind = qs.get("kind");
  const kindNum = kind ? Number(kind) : undefined;

  let params: Record<string, unknown> = {};
  try {
    params = JSON.parse(qs.get("params") ?? "{}");
  } catch {
    params = {};
  }
  // The event being signed (signEvent), if any.
  const event = method === "signEvent" ? (params.event as Record<string, unknown> | undefined) : undefined;

  // One scope, one decision. "once" sends no conditions (re-prompts next time,
  // nos2x semantics); "always" sends {} (stored, matches everything); "kind"
  // sends { kinds: { N: true } } (stored, kind-scoped). The same scope applies
  // to Allow or Reject.
  type Scope = "once" | "always" | "kind";
  let scope: Scope = "once";

  const scopes: { id: Scope; label: string }[] = [
    { id: "once", label: "Just this once" },
    { id: "always", label: "Always for this site" },
    ...(event && kindNum !== undefined
      ? [{ id: "kind" as Scope, label: `Always for kind ${kindNum}` }]
      : []),
  ];

  function conditionsFor(s: Scope): Record<string, unknown> | undefined {
    if (s === "always") return {};
    if (s === "kind" && kindNum !== undefined) return { kinds: { [kindNum]: true } };
    return undefined; // once → not stored, re-prompts next time
  }

  function reply(accept: boolean) {
    chrome.runtime.sendMessage({
      prompt: true,
      id,
      host,
      method,
      accept,
      conditions: conditionsFor(scope),
    });
    window.close();
  }

  const name = PERMISSION_NAMES[method] ?? method;
</script>

<div class="screen">
  <header>
    <div class="badge">🔑</div>
    <h1>{host}</h1>
    <p class="muted">
      wants permission to <strong class="perm">{name}</strong>.
    </p>
  </header>

  {#if event}
    <section class="event">
      <h2>Event to sign</h2>
      <pre>{JSON.stringify(event, null, 2)}</pre>
    </section>
  {/if}

  <section>
    <h2>Remember this decision</h2>
    {#each scopes as s (s.id)}
      <label class="radio">
        <input type="radio" name="scope" value={s.id} bind:group={scope} />
        <span>{s.label}</span>
      </label>
    {/each}
  </section>

  <footer>
    <button class="danger" onclick={() => reply(false)}>Reject</button>
    <button class="primary" onclick={() => reply(true)}>Allow</button>
  </footer>
</div>

<style>
  .screen {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: 100%;
  }
  header {
    text-align: center;
  }
  .badge {
    font-size: 1.6rem;
    line-height: 1;
    margin-bottom: 0.25rem;
  }
  header h1 {
    margin: 0 0 0.25rem;
    font-size: 1.1rem;
    word-break: break-all;
  }
  .perm {
    color: var(--ink);
  }
  .event pre {
    max-height: 150px;
  }
  .radio {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0;
    cursor: pointer;
    color: var(--ink);
    font-size: 0.9rem;
    margin: 0;
  }
  .radio input {
    width: auto;
    margin: 0;
    accent-color: var(--mint-deep);
  }
  footer {
    display: flex;
    gap: 0.5rem;
    margin-top: auto;
  }
  footer button {
    flex: 1;
  }
</style>
