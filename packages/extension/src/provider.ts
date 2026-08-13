/**
 * Provider — runs in the page's MAIN world (`world: "MAIN"` content script) and
 * installs `window.nostr` ([NIP-07]). Each call is relayed to the ISOLATED-world
 * content-script via `postMessage`; the content-script forwards it to the
 * service worker, which holds the key and does the crypto. No secret ever
 * touches page JS.
 */

import type { EventTemplate, VerifiedEvent } from "nostr-tools";

type NostrMethod =
  | "getPublicKey"
  | "signEvent"
  | "nip04.encrypt"
  | "nip04.decrypt"
  | "nip44.encrypt"
  | "nip44.decrypt";

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

const requests = new Map<string, Pending>();

function call(method: NostrMethod, params: Record<string, unknown>): Promise<unknown> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    requests.set(id, { resolve, reject });
    window.postMessage({ ext: "kj", id, method, params }, "*");
  });
}

window.addEventListener("message", (message) => {
  const data = message.data;
  if (!data || data.ext !== "kj" || !data.response) return;
  const pending = requests.get(data.id);
  if (!pending) return;
  requests.delete(data.id);
  const { result, error } = data.response as { result?: unknown; error?: { message: string } };
  if (error) pending.reject(new Error("keys.justworks: " + error.message));
  else pending.resolve(result);
});

/** The NIP-07 surface exposed to pages. */
export interface NostrApi {
  getPublicKey(): Promise<string>;
  signEvent(event: EventTemplate): Promise<VerifiedEvent>;
  getRelays(): Promise<Record<string, { read: boolean; write: boolean }>>;
  nip04: {
    encrypt(peer: string, plaintext: string): Promise<string>;
    decrypt(peer: string, ciphertext: string): Promise<string>;
  };
  nip44: {
    encrypt(peer: string, plaintext: string): Promise<string>;
    decrypt(peer: string, ciphertext: string): Promise<string>;
  };
}

declare global {
  interface Window {
    nostr?: NostrApi;
  }
}

window.nostr = {
  async getPublicKey() {
    return (await call("getPublicKey", {})) as string;
  },
  async signEvent(event: EventTemplate) {
    return (await call("signEvent", { event })) as VerifiedEvent;
  },
  async getRelays() {
    return {};
  },
  nip04: {
    async encrypt(peer: string, plaintext: string) {
      return (await call("nip04.encrypt", { peer, plaintext })) as string;
    },
    async decrypt(peer: string, ciphertext: string) {
      return (await call("nip04.decrypt", { peer, ciphertext })) as string;
    },
  },
  nip44: {
    async encrypt(peer: string, plaintext: string) {
      return (await call("nip44.encrypt", { peer, plaintext })) as string;
    },
    async decrypt(peer: string, ciphertext: string) {
      return (await call("nip44.decrypt", { peer, ciphertext })) as string;
    },
  },
};
