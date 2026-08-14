/**
 * Self-update detection for the extension.
 *
 * Chrome does not apply `update_url` updates for drag-installed CRXs on
 * Windows/macOS (off-store installs only auto-update on Linux / policy), so
 * the extension watches its own server: the SW periodically fetches the same
 * `update.xml` that drives Chrome's (Linux/policy) updater and, when it
 * advertises a newer version, sets a badge + shows a banner in the popup.
 *
 * Pure module (no `chrome.*`) so it's unit-testable; the SW owns storage +
 * badge side effects.
 */

/** `storage.local` key: `{ latest, checkedAt } | null` (null = up to date). */
export const UPDATE_KEY = "kj:update";

export interface UpdateInfo {
  latest: string;
  checkedAt: number; // epoch ms
}

/** Is `candidate` a strictly newer dotted version than `current`? */
export function isNewer(candidate: string, current: string): boolean {
  const a = candidate.split(".").map(Number);
  const b = current.split(".").map(Number);
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return false;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

export interface LatestVersion {
  version: string;
}

/**
 * Parse the GUpdate manifest (as produced by `crx3 -x` / served at
 * `/extension/update.xml`). Regex, not DOMParser — service workers have no
 * DOM, and the XML is a fixed two-line shape we generate ourselves.
 */
export function parseUpdateXml(xml: string): LatestVersion | null {
  const m = /<updatecheck[^>]*\sversion="([^"]+)"/.exec(xml);
  return m ? { version: m[1] } : null;
}

/**
 * Fetch the latest advertised version from the deployment that `apiBase`
 * points at (`/extension/update.xml` lives next to the API on the same
 * origin). Any failure (offline, 404 — artifacts not synced, malformed XML)
 * resolves to `null`; update detection must never break anything else.
 */
export async function fetchLatestUpdate(apiBase: string): Promise<LatestVersion | null> {
  try {
    const url = new URL("/extension/update.xml", apiBase).href;
    const res = await fetch(url);
    if (!res.ok) return null;
    return parseUpdateXml(await res.text());
  } catch {
    return null;
  }
}
