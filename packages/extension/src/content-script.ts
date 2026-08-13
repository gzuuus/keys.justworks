/**
 * Content script — ISOLATED world, the ONLY content script. Does two things:
 *
 *   1. Injects `public/provider.js` into the page's MAIN world as a `<script
 *      src>`. As an external extension resource (web_accessible_resources) it
 *      runs in the page context and is exempt from page CSP, so it works on
 *      every site and every Chrome version. This replaces a `world: "MAIN"`
 *      content script, which crxjs mis-handles
 *      (github.com/crxjs/chrome-extension-tools/issues/695).
 *
 *   2. Bridges the page's `window.nostr` calls (posted from the provider) to
 *      the service worker over `chrome.runtime`, and relays the response back.
 *      Only messages shaped like a CALL (`{ ext, method }`) are forwarded;
 *      replies (`{ ext, response }`) are ignored here so there's no loop.
 *
 * Runs at `document_start` so `window.nostr` exists before page scripts — the
 * correct NIP-07 timing for reliable detection. At document_start `<head>` may
 * not exist yet, so append to `documentElement`.
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

// Inject the provider into the page (MAIN world via <script src>).
try {
  const s = document.createElement("script");
  s.src = chrome.runtime.getURL("provider.js");
  s.async = false;
  (document.head || document.documentElement).appendChild(s);
} catch (e) {
  console.error("[kj] provider injection failed", e);
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
