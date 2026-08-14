/**
 * Self-update detection: version comparison, GUpdate XML parsing, and the
 * fetch-against-update.xml path (stubbed fetch — the module is chrome-free).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLatestUpdate, isNewer, parseUpdateXml } from './update';

describe('isNewer', () => {
  it('compares numerically per segment', () => {
    expect(isNewer('0.0.4', '0.0.3')).toBe(true);
    expect(isNewer('0.1.0', '0.0.99')).toBe(true);
    expect(isNewer('1.0.0', '0.9.9')).toBe(true);
    expect(isNewer('0.0.3', '0.0.4')).toBe(false);
    expect(isNewer('0.0.3', '0.0.3')).toBe(false);
  });

  it('tolerates differing lengths and rejects garbage', () => {
    expect(isNewer('0.1', '0.0.9')).toBe(true);
    expect(isNewer('0.0.10', '0.0.9')).toBe(true);
    expect(isNewer('x.y.z', '0.0.3')).toBe(false);
  });
});

describe('parseUpdateXml', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="dibifnobcgcbgmgeckaanlniggnoljfl">
    <updatecheck codebase="https://keys.justworks.cash/extension/keys-justworks.crx" version="0.0.4" prodversionmin="64.0.3242" />
  </app>
</gupdate>`;

  it('extracts the advertised version', () => {
    expect(parseUpdateXml(xml)).toEqual({ version: '0.0.4' });
  });

  it('returns null on malformed input', () => {
    expect(parseUpdateXml('<html>404</html>')).toBeNull();
    expect(parseUpdateXml('')).toBeNull();
  });
});

describe('fetchLatestUpdate', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches /extension/update.xml resolved against the apiBase origin', async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      new Response('<gupdate><app><updatecheck version="0.0.4" /></app></gupdate>'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchLatestUpdate('https://keys.justworks.cash/api')).toEqual({ version: '0.0.4' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://keys.justworks.cash/extension/update.xml');
  });

  it('resolves null on non-OK and on network failure (never throws)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    expect(await fetchLatestUpdate('https://self.example/api')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    expect(await fetchLatestUpdate('https://self.example/api')).toBeNull();
  });
});
