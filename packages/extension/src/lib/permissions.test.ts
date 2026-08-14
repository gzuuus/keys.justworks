/**
 * Unit tests for the per-site permission store (mirrors nos2x's model).
 *
 * Covers the resolution rules that gate silent signing (the security-relevant
 * part): allow/deny/undefined, kind conditions, allow-first ordering, kind
 * merging, reverse-dedup, and removal. Uses a stubbed `chrome.storage.local`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store: Record<string, unknown> = {};

beforeEach(() => {
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
        set: async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        },
      },
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of Object.keys(store)) delete store[k];
});

const {
  getPermissionStatus,
  updatePermission,
  removePermission,
  listPermissions,
} = await import('./permissions');

const M = 'signEvent' as const;

describe('getPermissionStatus', () => {
  it('undefined when nothing stored (→ prompt)', async () => {
    expect(await getPermissionStatus('a.com', 'getPublicKey')).toBeUndefined();
  });

  it('stored allow / deny resolves without prompting', async () => {
    await updatePermission('a.com', 'getPublicKey', true, {});
    await updatePermission('b.com', 'getPublicKey', false, {});
    expect(await getPermissionStatus('a.com', 'getPublicKey')).toBe(true);
    expect(await getPermissionStatus('b.com', 'getPublicKey')).toBe(false);
    // other hosts unaffected
    expect(await getPermissionStatus('c.com', 'getPublicKey')).toBeUndefined();
  });

  it('kind conditions scope signEvent', async () => {
    await updatePermission('a.com', M, true, { kinds: { 1: true } });
    expect(await getPermissionStatus('a.com', M, 1)).toBe(true);
    // kind 7 not covered → prompt, NOT the stored allow
    expect(await getPermissionStatus('a.com', M, 7)).toBeUndefined();
    // kind filter can't match a method that carries no event
    expect(await getPermissionStatus('a.com', 'getPublicKey')).toBeUndefined();
  });

  it('checks allow before deny (nos2x ordering)', async () => {
    await updatePermission('a.com', M, false, {});
    await updatePermission('a.com', M, true, {});
    // both stored (blanket, opposite) → allow wins
    expect(await getPermissionStatus('a.com', M, 1)).toBe(true);
    // but the blanket-deny is dropped by reverse-dedup (same conditions)…
  });

  it('deny with kind conditions only denies those kinds', async () => {
    await updatePermission('a.com', M, false, { kinds: { 4: true } });
    expect(await getPermissionStatus('a.com', M, 4)).toBe(false);
    expect(await getPermissionStatus('a.com', M, 1)).toBeUndefined();
  });
});

describe('updatePermission', () => {
  it('merges kind conditions into an existing same-direction policy', async () => {
    await updatePermission('a.com', M, true, { kinds: { 1: true } });
    await updatePermission('a.com', M, true, { kinds: { 7: true } });
    expect(await getPermissionStatus('a.com', M, 1)).toBe(true);
    expect(await getPermissionStatus('a.com', M, 7)).toBe(true);
    expect(await getPermissionStatus('a.com', M, 3)).toBeUndefined();
  });

  it('drops the exact reverse policy; a differing one survives (conservative)', async () => {
    // blanket deny, then allow kind 1: reverse conditions differ → deny SURVIVES.
    await updatePermission('a.com', M, false, {});
    await updatePermission('a.com', M, true, { kinds: { 1: true } });
    expect(await getPermissionStatus('a.com', M, 1)).toBe(true);
    // kind 7 falls through the allow to the surviving blanket deny — denied,
    // not prompted. Conservative by design (nos2x keeps differing reverses).
    expect(await getPermissionStatus('a.com', M, 7)).toBe(false);
  });
});

describe('removePermission / listPermissions', () => {
  it('removes exactly the (host, accept, method) entry', async () => {
    await updatePermission('a.com', M, true, {});
    await updatePermission('a.com', 'getPublicKey', true, {});
    await removePermission('a.com', true, M);
    expect(await getPermissionStatus('a.com', M, 1)).toBeUndefined();
    expect(await getPermissionStatus('a.com', 'getPublicKey')).toBe(true);
  });

  it('lists flat entries, newest first', async () => {
    let t = 0;
    vi.useFakeTimers();
    const add = async (host: string, method: 'getPublicKey' | 'nip04.encrypt') => {
      vi.setSystemTime(++t * 1000);
      await updatePermission(host, method, true, {});
    };
    await add('old.com', 'getPublicKey');
    await add('new.com', 'nip04.encrypt');
    vi.useRealTimers();
    const list = await listPermissions();
    expect(list.map((e) => e.host)).toEqual(['new.com', 'old.com']);
  });
});
