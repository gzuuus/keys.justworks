/**
 * Provider — injected into the page's MAIN world as a `<script src>` from the
 * ISOLATED-world content-script (the nos2x pattern). Installs `window.nostr`
 * ([NIP-07]); each call is posted to the content-script, which forwards it to
 * the service worker that holds the key and does the crypto. No secret ever
 * touches page JS.
 *
 * Plain JS on purpose: this file is a static asset (public/), copied verbatim
 * to dist/provider.js so the content-script can reference it by a stable path
 * via chrome.runtime.getURL. As an external extension resource loaded through
 * web_accessible_resources it is exempt from page CSP, so it works on every
 * site regardless of a strict script-src.
 *
 * (We don't use a `world: "MAIN"` content script here — crxjs mis-handles those;
 * see github.com/crxjs/chrome-extension-tools/issues/695.)
 */
(function () {
  const requests = new Map();

  function call(method, params) {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      requests.set(id, { resolve, reject });
      window.postMessage({ ext: "kj", id, method, params }, "*");
    });
  }

  window.addEventListener("message", (e) => {
    const data = e.data;
    if (!data || data.ext !== "kj" || !data.response) return;
    const pending = requests.get(data.id);
    if (!pending) return;
    requests.delete(data.id);
    const { result, error } = data.response;
    if (error) pending.reject(new Error("keys.justworks: " + error.message));
    else pending.resolve(result);
  });

  window.nostr = {
    async getPublicKey() {
      return call("getPublicKey", {});
    },
    async signEvent(event) {
      return call("signEvent", { event });
    },
    async getRelays() {
      return {};
    },
    nip04: {
      async encrypt(peer, plaintext) {
        return call("nip04.encrypt", { peer, plaintext });
      },
      async decrypt(peer, ciphertext) {
        return call("nip04.decrypt", { peer, ciphertext });
      },
    },
    nip44: {
      async encrypt(peer, plaintext) {
        return call("nip44.encrypt", { peer, plaintext });
      },
      async decrypt(peer, ciphertext) {
        return call("nip44.decrypt", { peer, ciphertext });
      },
    },
  };
})();
