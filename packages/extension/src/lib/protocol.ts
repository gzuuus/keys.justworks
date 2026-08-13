/**
 * Wire protocol for the three actors in the extension:
 *
 *   page JS ──postMessage──▶ content-script ──runtime──▶ service worker
 *     (window.nostr)            (isolated)        (holds key, crypto, perms)
 *
 * And the privileged side:
 *   popup / options ──runtime──▶ service worker   (no permission gating)
 *
 * `NostrMethod` are the NIP-07 ops a page may request; everything else is a
 * privileged UI command. Tagged unions keep the SW dispatch exhaustive.
 */

/** A NIP-07 operation a page can request through `window.nostr`. */
export type NostrMethod =
  | "getPublicKey"
  | "signEvent"
  | "nip04.encrypt"
  | "nip04.decrypt"
  | "nip44.encrypt"
  | "nip44.decrypt";

/** Human description per method, shown in the approval prompt + permissions UI. */
export const PERMISSION_NAMES: Record<NostrMethod, string> = {
  getPublicKey: "read your public key",
  signEvent: "sign events with your key",
  "nip04.encrypt": "encrypt messages to peers (nip04)",
  "nip04.decrypt": "decrypt messages from peers (nip04)",
  "nip44.encrypt": "encrypt messages to peers (nip44)",
  "nip44.decrypt": "decrypt messages from peers (nip44)",
};

// --- page ↔ content-script (postMessage, shared window across worlds) --------

/** provider (MAIN world) → content-script: a window.nostr call. */
export interface PageCall {
  ext: "kj";
  id: string; // correlation id
  method: NostrMethod;
  params: Record<string, unknown>;
}

/** content-script → provider: the response to a PageCall. */
export interface PageReply {
  ext: "kj";
  id: string;
  response: { result?: unknown; error?: { message: string } };
}

// --- content-script → service worker (runtime.sendMessage) -------------------

/** A page request forwarded to the SW with the requesting host attached. */
export interface BgPageRequest {
  src: "page";
  method: NostrMethod;
  params: Record<string, unknown>;
  host: string;
}

/** The prompt window's user decision, sent back to the SW. */
export interface BgPromptReply {
  prompt: true;
  id: string;
  host: string;
  method: NostrMethod;
  accept: boolean;
  conditions?: Conditions;
}

// --- UI (popup/options) → service worker -------------------------------------

export type BgUiMessage =
  | { src: "ui"; cmd: "status" }
  | { src: "ui"; cmd: "login"; identifier: string; password: string }
  | { src: "ui"; cmd: "lock" }
  | { src: "ui"; cmd: "create"; identifier: string; password: string }
  | { src: "ui"; cmd: "importKey"; nsec: string; identifier: string; password: string }
  | {
      src: "ui";
      cmd: "changePassword";
      identifier: string;
      password: string;
      newPassword: string;
    }
  | { src: "ui"; cmd: "exportNsec" }
  | { src: "ui"; cmd: "erase"; identifier: string; password: string }
  | { src: "ui"; cmd: "getConfig" }
  | { src: "ui"; cmd: "setConfig"; apiBase: string }
  | { src: "ui"; cmd: "cachedAccounts" }
  | { src: "ui"; cmd: "listPermissions" }
  | {
      src: "ui";
      cmd: "removePermission";
      host: string;
      accept: boolean;
      method: NostrMethod;
    };

export type BgMessage = BgPageRequest | BgPromptReply | BgUiMessage;

/** SW → UI reply envelope (errors come back as { ok: false, error }). */
export type BgReply<T> = { ok: true; result: T } | { ok: false; error: string };

// --- permission conditions (mirrors nos2x: optional event-kind allow-list) ---

/** A permission filter. `{}` = match everything; `{ kinds: { 1: true } }` =
 *  only kind-1 events (signEvent). */
export interface Conditions {
  kinds?: Record<number, boolean>;
}

export function isEmptyConditions(c?: Conditions): boolean {
  return !c || Object.keys(c).length === 0;
}
