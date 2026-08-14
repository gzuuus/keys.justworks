/**
 * Profile enrichment (kind 0) for the extension — storage-mediated, no
 * applesauce: the surfaces here are an ephemeral popup and the manage page,
 * so there's no long-lived reactive store to justify it. One-shot
 * SimplePool fetch (nostr-tools, already a dep) → verify → parse → write
 * chrome.storage.local; UI surfaces read storage only (zero RTT on render)
 * and live-update via storage.onChanged.
 *
 * Pure transform + helpers are exported for tests.
 */
import { nip19, verifyEvent, type Event } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';

/** storage.local key: `{ [hex pubkey]: ProfileEntry }`. */
export const PROFILE_KEY = 'kj:profiles';

/** Relays that index kind 0 (purplepag.es is purpose-built for it). */
export const METADATA_RELAYS = ['wss://purplepag.es', 'wss://nos.lol', 'wss://relay.damus.io'];

const FRESH_MS = 7 * 24 * 60 * 60 * 1000;

export interface ProfileEntry {
  name?: string;
  display_name?: string;
  picture?: string;
  nip05?: string;
  fetchedAt: number; // epoch ms
}
export type ProfileMap = Record<string, ProfileEntry>;

export function npubToHex(npub: string): string | null {
  try {
    const d = nip19.decode(npub);
    return d.type === 'npub' ? (d.data as string) : null;
  } catch {
    return null;
  }
}

/** Deterministic fallback avatar color derived from the pubkey. */
export function hexColor(hex: string): string {
  const h = Number.parseInt(hex.slice(0, 4), 16) || 0;
  return `hsl(${h % 360} 55% 42%)`;
}

export function isStale(e: ProfileEntry | undefined, now = Date.now()): boolean {
  return !e || now - e.fetchedAt > FRESH_MS;
}

export function displayName(e: ProfileEntry | null | undefined): string | null {
  return e?.name?.trim() || e?.display_name?.trim() || null;
}

/** Only https pictures — kind 0 content is attacker-controlled JSON. */
export function avatarUrl(e: ProfileEntry | null | undefined): string | null {
  const p = e?.picture;
  return p && p.startsWith('https://') ? p : null;
}

/**
 * Latest verified kind 0 per pubkey → entries. Signature-unverified,
 * non-kind-0, or malformed-content events are skipped entirely — a hostile
 * relay must not be able to put a name on someone else's key.
 */
export function toProfileEntries(events: Event[], now = Date.now()): ProfileMap {
  const latest = new Map<string, Event>();
  for (const e of events) {
    if (e.kind !== 0 || !verifyEvent(e)) continue;
    const prev = latest.get(e.pubkey);
    if (!prev || e.created_at > prev.created_at) latest.set(e.pubkey, e);
  }
  const out: ProfileMap = {};
  for (const [pubkey, e] of latest) {
    try {
      const c = JSON.parse(e.content) as Partial<ProfileEntry>;
      out[pubkey] = {
        name: typeof c.name === 'string' ? c.name : undefined,
        display_name: typeof c.display_name === 'string' ? c.display_name : undefined,
        picture: typeof c.picture === 'string' ? c.picture : undefined,
        nip05: typeof c.nip05 === 'string' ? c.nip05 : undefined,
        fetchedAt: now,
      };
    } catch {
      /* malformed JSON content → skip */
    }
  }
  return out;
}

export async function loadProfiles(): Promise<ProfileMap> {
  const o = (await chrome.storage.local.get(PROFILE_KEY))[PROFILE_KEY];
  return (o as ProfileMap | undefined) ?? {};
}

/** One-shot fetch from the metadata relays; merges into storage and returns
 *  the merged map. Offline / no-profile resolves to the existing map —
 *  enrichment is best-effort and must never throw to callers. */
export async function fetchProfiles(hexes: string[]): Promise<ProfileMap> {
  if (!hexes.length) return loadProfiles();
  const pool = new SimplePool();
  let events: Event[] = [];
  try {
    events = (await pool.querySync(METADATA_RELAYS, { kinds: [0], authors: hexes })) as Event[];
  } catch {
    events = []; // a relay hiccup must not break anything
  } finally {
    pool.close(METADATA_RELAYS);
  }
  const fresh = toProfileEntries(events);
  const merged = { ...(await loadProfiles()), ...fresh };
  if (Object.keys(fresh).length) await chrome.storage.local.set({ [PROFILE_KEY]: merged });
  return merged;
}

/** Fetch only what's missing or stale. Returns the merged map. */
export async function ensureFresh(hexes: string[]): Promise<ProfileMap> {
  const cur = await loadProfiles();
  const stale = hexes.filter((h) => isStale(cur[h]));
  return stale.length ? fetchProfiles(stale) : cur;
}
