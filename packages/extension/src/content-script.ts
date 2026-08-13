/**
 * Content script — ISOLATED world. Bridges the page's `window.nostr` calls
 * (posted from the MAIN-world provider) to the service worker over
 * `chrome.runtime`, and relays the response back.
 *
 * It shares `window` with the MAIN-world provider, so they communicate via
 * `postMessage`. Only messages shaped like a CALL (`{ ext, method }`) are
 * forwarded; replies (`{ ext, response }`) are ignored here so there's no loop.
 */

interface PageCall {
  ext: "kj";
  id: string;
  method: string;
  params: Record<string, unknown>;
}

function isCall(d: unknown): d is PageCall {
  return (
    typeof d === "object" &&
    d !== null &&
    (d as { ext?: unknown }).ext === "kj" &&
    typeof (d as { method?: unknown }).method === "string"
  );
}

window.addEventListener("message", async (message) => {
  if (message.source !== window) return;
  if (!isCall(message.data)) return;

  const call = message.data;
  let response: { result?: unknown; error?: { message: string } };
  try {
    const res = await chrome.runtime.sendMessage({
      src: "page",
      method: call.method,
      params: call.params,
      host: location.host,
    });
    response =
      res && typeof res === "object" && ("result" in res || "error" in res)
        ? (res as { result?: unknown; error?: { message: string } })
        : { error: { message: "no response from signer" } };
  } catch (e) {
    response = { error: { message: e instanceof Error ? e.message : "runtime error" } };
  }
  window.postMessage({ ext: "kj", id: call.id, response }, location.origin);
});
