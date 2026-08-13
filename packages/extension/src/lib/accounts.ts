/**
 * Tier A offline account cache — mirrors `packages/web`'s
 * `keyholder/accounts.svelte.ts`, but imperative and in `storage.local` (the SW
 * has no localStorage/DOM).
 *
 * Caches the `ncryptsec` of every account successfully unlocked on this
 * browser, keyed by `H(identifier)`, so a returning user can unlock without a
 * server round-trip — and fully offline. **Never stores the plaintext
 * identifier**, only its one-way hash (already known to the server), so the
 * keystone property holds: an attacker reading `storage.local` still needs
 * `identifier ‖ password` to decrypt. A cached entry is just a duplicate of
 * what the server already holds (encrypted blob + public npub + a hash already
 * on the server) — no new secret reaches the device.
 *
 * `npub` is stored as the display identity (public) and as a tamper/stale
 * check: after decrypting a cached blob the SW asserts the result matches, so a
 * swapped or stale blob (password changed on another device) is detected.
 */
export interface CachedAccount {
  ncryptsec: string;
  npub: string;
  label: string; // display name; defaults to a shortened npub
  updatedAt: number; // epoch ms; drives recency ordering in the UI
}

const STORAGE_KEY = "kj:accounts";
type StoreShape = Record<string, CachedAccount>; // identifierHash → account

export async function loadAll(): Promise<StoreShape> {
  try {
    return ((await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as StoreShape) ?? {};
  } catch {
    return {};
  }
}

async function writeAll(all: StoreShape): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: all });
}

/** Shorten an npub (or any long string) for display: `npub1abc…wxyz`. */
export function shortNpub(s: string): string {
  return s.length > 16 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s;
}

export async function lookup(identifierHash: string): Promise<CachedAccount | undefined> {
  return (await loadAll())[identifierHash];
}

export async function list(): Promise<{ id: string; account: CachedAccount }[]> {
  const all = await loadAll();
  return Object.entries(all)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .map(([id, account]) => ({ id, account }));
}

/** Upsert after a successful unlock. Preserves an existing label. */
export async function save(identifierHash: string, ncryptsec: string, npub: string): Promise<void> {
  const all = await loadAll();
  all[identifierHash] = {
    ncryptsec,
    npub,
    label: all[identifierHash]?.label ?? shortNpub(npub),
    updatedAt: Date.now(),
  };
  await writeAll(all);
}

/** Bump `updatedAt` on a cache-hit unlock (recency ordering). */
export async function touch(identifierHash: string): Promise<void> {
  const all = await loadAll();
  const acct = all[identifierHash];
  if (!acct) return;
  acct.updatedAt = Date.now();
  await writeAll(all);
}

export async function remove(identifierHash: string): Promise<void> {
  const all = await loadAll();
  delete all[identifierHash];
  await writeAll(all);
}

export async function clear(): Promise<void> {
  await writeAll({});
}
