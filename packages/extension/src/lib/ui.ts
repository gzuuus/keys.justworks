/**
 * Shared helpers for the extension's own pages (popup / options / prompt).
 * Keeps the UI↔SW send envelope, the status reply shape, and npub formatting
 * in one place instead of copy-pasted across components.
 */
import type { BgReply } from "./protocol";

/** Reply shape of the SW `status` command. */
export type Status = { unlocked: boolean; npub: string | null };

/** Send a privileged UI command to the SW; throws on `{ ok: false }`. */
export async function send<T>(msg: unknown): Promise<T> {
  const r = (await chrome.runtime.sendMessage(msg)) as BgReply<T>;
  if (!r.ok) throw new Error(r.error);
  return r.result;
}

/** npub1xxxxxxxx…xxxxxx — compact display for narrow surfaces. */
export function shortNpub(n: string): string {
  return n.length > 16 ? `${n.slice(0, 10)}…${n.slice(-6)}` : n;
}
