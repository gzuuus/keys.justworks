/**
 * keys.justworks — page-side keyholder client.
 *
 * Wraps a Web Worker (`postMessage`) in the NIP-07 `window.nostr` shape —
 * `getPublicKey`, `signEvent`, `nip04`, `nip44` — plus `unlock`/`lock`/`status`
 * lifecycle for our key-management flow. The page speaks this; the decrypted
 * secret stays in the Worker.
 *
 * The bridge interface is the postMessage protocol in `core.ts`, so a later
 * swap of the Worker for a sandboxed cross-origin vault iframe (design.md
 * hardening upgrade) is a transport change, not an API change.
 */
import type { EventTemplate } from "nostr-tools";
import type { KeyholderOp, KeyholderOps, KeyholderReq, KeyholderRes, KeyholderNotification } from "./core";

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

export class Keyholder {
  #worker: Worker;
  #pending = new Map<string, Pending>();

  /** Invoked when the Worker auto-locks the key after idle (page updates its UI). */
  onAutoLock: (() => void) | null = null;

  constructor(worker: Worker) {
    this.#worker = worker;
    worker.onmessage = (e: MessageEvent<KeyholderRes | KeyholderNotification>) => {
      const msg = e.data;
      if ("notification" in msg) {
        if (msg.notification === "auto-locked" && this.onAutoLock) this.onAutoLock();
        return;
      }
      const p = this.#pending.get(msg.id);
      if (!p) return;
      this.#pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error));
    };
    worker.onerror = (e) => {
      const err = new Error(e.message || "keyholder worker error");
      for (const p of this.#pending.values()) p.reject(err);
      this.#pending.clear();
    };
  }

  /** Send an op, await its typed result. */
  #send<K extends KeyholderOp>(op: K, payload: KeyholderOps[K]["req"]): Promise<KeyholderOps[K]["res"]> {
    const id = crypto.randomUUID();
    const msg = { id, op, payload } as KeyholderReq;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.#worker.postMessage(msg);
    });
  }

  /** Lifecycle. */
  unlock(ncryptsec: string, identifier: string, password: string) {
    return this.#send("unlock", { ncryptsec, identifier, password });
  }
  /** One-shot: wrap an existing nsec into an ncryptsec inside the Worker. */
  import(nsec: string, identifier: string, password: string) {
    return this.#send("import", { nsec, identifier, password });
  }
  lock() {
    return this.#send("lock", undefined);
  }
  status() {
    return this.#send("status", undefined);
  }

  /** NIP-07 signing surface. */
  getPublicKey() {
    return this.#send("getPublicKey", undefined);
  }
  signEvent(event: EventTemplate) {
    return this.#send("signEvent", { event });
  }

  get nip04(): {
    encrypt: (pubkey: string, plaintext: string) => Promise<string>;
    decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
  } {
    return {
      encrypt: (pubkey, plaintext) => this.#send("nip04.encrypt", { pubkey, plaintext }),
      decrypt: (pubkey, ciphertext) => this.#send("nip04.decrypt", { pubkey, ciphertext }),
    };
  }

  get nip44(): {
    encrypt: (pubkey: string, plaintext: string) => Promise<string>;
    decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
  } {
    return {
      encrypt: (pubkey, plaintext) => this.#send("nip44.encrypt", { pubkey, plaintext }),
      decrypt: (pubkey, ciphertext) => this.#send("nip44.decrypt", { pubkey, ciphertext }),
    };
  }

  /** Terminate the underlying worker (drops the held key). */
  destroy() {
    this.#worker.terminate();
    this.#pending.clear();
  }
}

/** Create a Keyholder backed by a fresh module Worker. */
export function createKeyholder(): Keyholder {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  return new Keyholder(worker);
}
