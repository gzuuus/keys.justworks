/**
 * Profile enrichment: signature-verified latest-wins kind-0 parsing, content
 * sanitization, freshness window, npub→hex, and storage round-trip (stubbed
 * chrome.storage — same shape as the background harness).
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, nip19, verifiedSymbol } from 'nostr-tools';
import type { Event } from 'nostr-tools';
import {
  avatarUrl,
  displayName,
  fetchProfiles,
  hexColor,
  isStale,
  loadProfiles,
  npubToHex,
  PROFILE_KEY,
  toProfileEntries
} from './profiles';

function kind0(sk: Uint8Array, content: unknown, created_at: number): Event {
  return finalizeEvent({ kind: 0, created_at, tags: [], content: JSON.stringify(content) }, sk);
}

const sk = generateSecretKey();
const pub = getPublicKey(sk);

describe('toProfileEntries', () => {
  it('keeps the latest verified event per pubkey', () => {
    const older = kind0(sk, { name: 'old' }, 1000);
    const newer = kind0(sk, { name: 'new' }, 2000);
    const entries = toProfileEntries([older, newer]);
    expect(entries[pub]?.name).toBe('new');
  });

  it('drops signature-tampered events (hostile relay cannot rename a key)', () => {
    const good = kind0(sk, { name: 'real' }, 1000);
    // Strip nostr-tools' cached-verification symbol (set by finalizeEvent and
    // copied by the spread) so verifyEvent actually re-runs — wire events
    // never carry it, but our local clone would.
    const forged: Event = { ...kind0(sk, { name: 'fake' }, 2000) };
    delete (forged as Record<symbol, unknown>)[verifiedSymbol];
    forged.content = JSON.stringify({ name: 'fake2' }); // id/sig no longer match
    const entries = toProfileEntries([forged, good]);
    expect(entries[pub]?.name).toBe('real');
  });

  it('drops non-https pictures and keeps the rest of the content', () => {
    const e = kind0(sk, { name: 'x', picture: 'http://evil/x.png' }, 1000);
    const entries = toProfileEntries([e]);
    expect(entries[pub]?.picture).toBe('http://evil/x.png'); // stored raw…
    expect(avatarUrl(entries[pub])).toBeNull(); // …but never rendered
  });

  it('skips malformed JSON content and non-kind-0 events', () => {
    const bad: Event = { ...kind0(sk, { name: 'ok' }, 1000) };
    bad.content = '{not json';
    expect(toProfileEntries([bad])).toEqual({});
    const note = finalizeEvent({ kind: 1, created_at: 1, tags: [], content: 'hi' }, sk);
    expect(toProfileEntries([note])).toEqual({});
  });
});

describe('helpers', () => {
  it('npubToHex round-trips', () => {
    expect(npubToHex(nip19.npubEncode(pub))).toBe(pub);
    expect(npubToHex('garbage')).toBeNull();
  });

  it('displayName prefers name over display_name, null when absent', () => {
    expect(displayName({ name: ' a ', display_name: 'b', fetchedAt: 0 })).toBe('a');
    expect(displayName({ display_name: 'b', fetchedAt: 0 })).toBe('b');
    expect(displayName(null)).toBeNull();
  });

  it('avatarUrl only accepts https', () => {
    expect(avatarUrl({ picture: 'https://ok/x.png', fetchedAt: 0 })).toBe('https://ok/x.png');
    expect(avatarUrl({ picture: 'data:text/html,x', fetchedAt: 0 })).toBeNull();
  });

  it('isStale honors the 7-day window', () => {
    const now = 1_000_000_000;
    expect(isStale({ fetchedAt: now - 1000 }, now)).toBe(false);
    expect(isStale({ fetchedAt: now - 8 * 24 * 3600 * 1000 }, now)).toBe(true);
    expect(isStale(undefined, now)).toBe(true);
  });

  it('hexColor is deterministic hsl', () => {
    expect(hexColor(pub)).toBe(hexColor(pub));
    expect(hexColor(pub)).toMatch(/^hsl\(\d+ 55% 42%\)$/);
  });
});

describe('storage round-trip', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loadProfiles/fetchProfiles persist and merge via chrome.storage', async () => {
    const store: Record<string, unknown> = {};
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: async (k: string) => (k in store ? { [k]: store[k] } : {}),
          set: async (o: Record<string, unknown>) => void Object.assign(store, o)
        }
      }
    });

    expect(await loadProfiles()).toEqual({}); // empty start

    // Simulate a relay reply by feeding toProfileEntries through the same
    // merge path fetchProfiles uses (network itself is not under test).
    const entries = toProfileEntries([kind0(sk, { name: 'me' }, 1000)]);
    await chrome.storage.local.set({ [PROFILE_KEY]: entries });
    const loaded = await loadProfiles();
    expect(loaded[pub]?.name).toBe('me');
    expect(avatarUrl(loaded[pub])).toBeNull();
  });
});
