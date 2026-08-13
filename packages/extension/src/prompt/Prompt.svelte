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

  function reply(accept: boolean, conditions?: Record<string, unknown>) {
    chrome.runtime.sendMessage({
      prompt: true,
      id,
      host,
      method,
      accept,
      conditions,
    });
    window.close();
  }

  const name = PERMISSION_NAMES[method] ?? method;
</script>

<div style="padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; height: 100%">
  <div>
    <h1 style="margin: 0 0 0.25rem">{host}</h1>
    <p class="muted" style="margin: 0">
      wants permission to <strong style="color: var(--fg)">{name}</strong>.
    </p>
  </div>

  {#if event}
    <div>
      <h2>Event to sign</h2>
      <pre>{JSON.stringify(event, null, 2)}</pre>
    </div>
  {/if}

  <div style="flex: 1"></div>

  <div class="row" style="justify-content: space-between">
    <div class="row">
      {#if event && kindNum !== undefined}
        <button onclick={() => reply(true, { kinds: { [kindNum]: true } })}>
          ✓ kind {kindNum} forever
        </button>
      {/if}
      <button class="primary" onclick={() => reply(true, {})}>✓ authorize forever</button>
      <button onclick={() => reply(true)}>just this once</button>
    </div>
    <div class="row">
      {#if event && kindNum !== undefined}
        <button onclick={() => reply(false, { kinds: { [kindNum]: true } })}>
          ✗ kind {kindNum}
        </button>
      {/if}
      <button onclick={() => reply(false, {})}>✗ reject forever</button>
      <button onclick={() => reply(false)}>reject</button>
    </div>
  </div>
</div>
