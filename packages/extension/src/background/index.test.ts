/**
 * Service-worker orchestration tests — the extension's decision tree, driven
 * black-box through the real `chrome.runtime.onMessage` router.
 *
 * Harness: a stubbed `chrome` global (storage.local as a Map; windows.create
 * records prompts), a fake REST server implementing the locker's auth rules
 * (verifier equality stands in for argon2), and a fresh SW import per test
 * (`vi.resetModules`) so signer/lock state never leaks between tests. Crypto is
 * REAL (`@kj/core`): fixtures are computed once at module load — create/rewrap
 * are scrypt-bound — so each test pays at most one decrypt.
 *
 * The paths exercised are the ones the design leans on:
 *   - cache hit unlocks offline (no round-trip);
 *   - wrong password falls through to the server without nuking the cache;
 *   - a stale (re-encrypted elsewhere) or swapped (wrong npub) cache is
 *     detected and healed from the authoritative server blob;
 *   - the destructive ops (changePassword, erase) update server + cache + lock
 *     state coherently;
 *   - the permission prompt flow persists only explicit "forever" choices.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignerCore, type SignerOp, type SignerReq } from '@kj/core';

// --- fixtures (real crypto, computed once) -----------------------------------

const ID = 'alice@example.com';
const PW = 'correct horse battery staple';
const PW2 = 'new horse battery staple';

interface Fixture {
  ih: string;
  hex: string; // NIP-07 page shape for getPublicKey
  verifier: string; // passwordSecret(ID, PW) — the "argon2 input" stand-in
  verifier2: string; // passwordSecret(ID, PW2)
  npub: string;
  nsec: string;
  ncryptsec: string; // key A wrapped under (ID, PW)
  ncryptsec2: string; // key A re-wrapped under (ID, PW2)
  npubB: string; // a different key, wrapped under the same (ID, PW)
  ncryptsecB: string;
}

/** Untyped one-shot wrapper: the SW's `signerCall`, minus the SW. */
function makeCall(core: SignerCore) {
  return async (op: SignerOp, payload: unknown): Promise<unknown> => {
    const r = await core.handle({ id: 'fixture', op, payload } as SignerReq);
    if (!r.ok) throw new Error(r.error);
    return r.result;
  };
}

const FIX = await (async (): Promise<Fixture> => {
  const { identifierHash, passwordSecret } = await import('@kj/core');
  const call = makeCall(new SignerCore());
  const a = (await call('create', { identifier: ID, password: PW })) as {
    ncryptsec: string;
    npub: string;
    nsec: string;
  };
  await call('unlock', { ncryptsec: a.ncryptsec, identifier: ID, password: PW });
  const hex = (await call('getPublicKey', undefined)) as string;
  const rew = (await call('reencrypt', { identifier: ID, newPassword: PW2 })) as {
    ncryptsec: string;
  };
  // A genuinely different key under the same passphrase: a fresh SignerCore
  // generates a fresh random key — the "swapped blob" scenario needs npub≠npub.
  const b = (await makeCall(new SignerCore())('create', { identifier: ID, password: PW })) as {
    npub: string;
    ncryptsec: string;
  };
  return {
    ih: await identifierHash(ID),
    hex,
    verifier: await passwordSecret(ID, PW),
    verifier2: await passwordSecret(ID, PW2),
    npub: a.npub,
    nsec: a.nsec,
    ncryptsec: a.ncryptsec,
    ncryptsec2: rew.ncryptsec,
    npubB: b.npub,
    ncryptsecB: b.ncryptsec,
  };
})();

// --- fake chrome + fake server ------------------------------------------------

interface CachedEntry {
  ncryptsec: string;
  npub: string;
  label: string;
  updatedAt: number;
}

type Listener = (msg: unknown, sender: unknown, reply: (r: unknown) => void) => void;

function makeChrome() {
  const store: Record<string, unknown> = {};
  const messageListeners: Listener[] = [];
  const removedListeners: ((winId: number) => void)[] = [];
  const created: { id: number; url: string }[] = [];
  const chrome = {
    storage: {
      local: {
        get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
        set: async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        },
      },
    },
    runtime: {
      onMessage: { addListener: (fn: Listener) => void messageListeners.push(fn) },
      onInstalled: { addListener: () => {} },
      getURL: (p: string) => `chrome-extension://test/${p}`,
      openOptionsPage: async () => {},
      getManifest: () => ({ version: '0.0.4' }),
    },
    action: {
      setBadgeText: () => {},
      setBadgeBackgroundColor: () => {},
    },
    alarms: { create: () => {}, get: async () => undefined, onAlarm: { addListener: () => {} } },
    windows: {
      create: async (opts: { url: string }) => {
        const win = { id: created.length + 1, url: opts.url };
        created.push(win);
        return win;
      },
      getLastFocused: async () => ({ top: 0, left: 0, width: 1200, height: 900 }),
      remove: async () => {},
      onRemoved: { addListener: (fn: (winId: number) => void) => void removedListeners.push(fn) },
    },
  };
  return { chrome, store, messageListeners, removedListeners, created };
}

/** In-memory locker API. Mirrors the server's auth rules with verifier
 *  equality in place of argon2 — the SW can't tell the difference. */
function makeServer() {
  const accounts = new Map<string, { verifier: string; ncryptsec: string }>();
  const calls: { method: string; path: string }[] = [];
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? 'GET';
    const path = new URL(url, 'https://fake').pathname;
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, string>) : {};
    calls.push({ method, path });
    if (path.endsWith('/register')) {
      if (accounts.has(body.identifier_hash!)) return json(409, {});
      accounts.set(body.identifier_hash!, {
        verifier: body.password_secret!,
        ncryptsec: body.ncryptsec!,
      });
      return json(201, {});
    }
    const authed =
      (path.endsWith('/login') || path.endsWith('/blob') || path.endsWith('/account')) &&
      accounts.get(body.identifier_hash!)?.verifier === body.password_secret;
    if (path.endsWith('/login')) {
      if (!authed) return json(401, {});
      return json(200, { ncryptsec: accounts.get(body.identifier_hash!)!.ncryptsec });
    }
    if (path.endsWith('/blob')) {
      if (!authed) return json(401, {});
      const a = accounts.get(body.identifier_hash!)!;
      a.ncryptsec = body.new_ncryptsec!;
      if (body.new_password_secret) a.verifier = body.new_password_secret;
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/account')) {
      if (!authed) return json(401, {});
      accounts.delete(body.identifier_hash!);
      return new Response(null, { status: 204 });
    }
    return json(404, {});
  };
  return { fetchImpl, accounts, calls };
}

/** Reply envelope the SW actually sends (errors are strings, never throws). */
type Reply<T> = { ok: boolean; result?: T; error?: string };

interface SW {
  ctx: ReturnType<typeof makeChrome>;
  server: ReturnType<typeof makeServer>;
  send: <T = unknown>(msg: unknown) => Promise<Reply<T>>;
  ui: <T = unknown>(msg: Record<string, unknown>) => Promise<Reply<T>>;
  cache: () => Promise<CachedEntry | undefined>;
}

async function loadSW(): Promise<SW> {
  vi.resetModules();
  const ctx = makeChrome();
  const server = makeServer();
  vi.stubGlobal('chrome', ctx.chrome);
  vi.stubGlobal('fetch', server.fetchImpl);
  await import('./index');
  const listener = ctx.messageListeners[0];
  expect(listener).toBeDefined();
  const send = <T,>(msg: unknown): Promise<Reply<T>> =>
    new Promise((resolve) => listener!(msg, { tab: { windowId: 1 } }, (r) => resolve(r as Reply<T>)));
  const ui = async <T,>(msg: Record<string, unknown>): Promise<Reply<T>> => send<T>({ src: 'ui', ...msg });
  const cache = async (): Promise<CachedEntry | undefined> => {
    const { identifierHash } = await import('@kj/core');
    const all = (ctx.store['kj:accounts'] as Record<string, CachedEntry>) ?? {};
    return all[await identifierHash(ID)];
  };
  return { ctx, server, send, ui, cache };
}

const loginMsg = { cmd: 'login', identifier: ID, password: PW };
const statusMsg = { cmd: 'status' };
type NpubRes = { npub: string };
type StatusRes = { unlocked: boolean; npub: string | null };

// --- login: cache-first with server fallback ---------------------------------

describe('login orchestration', () => {
  let sw: SW;
  beforeEach(async () => {
    sw = await loadSW();
    sw.server.accounts.set(FIX.ih, { verifier: FIX.verifier, ncryptsec: FIX.ncryptsec });
  });

  it('cold login hits the server, returns the npub, and caches the blob', async () => {
    const r = await sw.ui<NpubRes>(loginMsg);
    expect(r.ok).toBe(true);
    expect(r.result).toEqual({ npub: FIX.npub });
    const cached = await sw.cache();
    expect(cached?.ncryptsec).toBe(FIX.ncryptsec);
    expect(cached?.npub).toBe(FIX.npub);
    expect(sw.server.calls.some((c) => c.path.endsWith('/login'))).toBe(true);
  });

  it('cached login works offline — no server round-trip', async () => {
    await sw.ui(loginMsg);
    sw.server.calls.length = 0;
    const r = await sw.ui<NpubRes>(loginMsg);
    expect(r.ok).toBe(true);
    expect(r.result).toEqual({ npub: FIX.npub });
    expect(sw.server.calls).toHaveLength(0);
  });

  it('wrong password on a cold login fails and caches nothing', async () => {
    const r = await sw.ui({ ...loginMsg, password: 'wrong' });
    expect(r.ok).toBe(false);
    expect(await sw.cache()).toBeUndefined();
  });

  it('wrong password with a cache present falls through but keeps the cache', async () => {
    await sw.ui(loginMsg);
    const r = await sw.ui({ ...loginMsg, password: 'wrong' });
    expect(r.ok).toBe(false);
    // A typo must not evict the entry a correct password still needs.
    expect((await sw.cache())?.ncryptsec).toBe(FIX.ncryptsec);
  });

  it('stale cache (password changed server-side) is healed from the server', async () => {
    await sw.ui(loginMsg); // cache now holds the blob under PW
    // rotate server-side (as if changed on another device)
    sw.server.accounts.set(FIX.ih, { verifier: FIX.verifier2, ncryptsec: FIX.ncryptsec2 });
    const r = await sw.ui<NpubRes>({ ...loginMsg, password: PW2 });
    expect(r.ok).toBe(true);
    expect(r.result).toEqual({ npub: FIX.npub }); // same key, same identity
    expect((await sw.cache())?.ncryptsec).toBe(FIX.ncryptsec2);
  });

  it('swapped cache blob (npub mismatch) is discarded; the server blob wins', async () => {
    await sw.ui(loginMsg);
    // Tamper the cache: B's blob paired with A's recorded npub (corruption /
    // storage tampering — the SW itself only ever writes consistent pairs).
    const entry = (await sw.cache())!;
    entry.ncryptsec = FIX.ncryptsecB; // decrypts to a different key than entry.npub claims
    // Cached decrypt succeeds but yields B's npub → mismatch → evict + heal.
    const r = await sw.ui<NpubRes>(loginMsg);
    expect(r.ok).toBe(true);
    expect(r.result).toEqual({ npub: FIX.npub }); // the server's A blob wins
    expect((await sw.cache())?.ncryptsec).toBe(FIX.ncryptsec);
    expect((await sw.cache())?.npub).toBe(FIX.npub);
  });
});

// --- lifecycle -----------------------------------------------------------------

describe('create / import', () => {
  let sw: SW;
  beforeEach(async () => {
    sw = await loadSW();
  });

  it('create registers, unlocks, caches, and returns the one-time nsec', async () => {
    const r = await sw.ui<{ npub: string; nsec: string }>({ cmd: 'create', identifier: ID, password: PW });
    expect(r.ok).toBe(true);
    expect(r.result!.npub).toMatch(/^npub1/);
    expect(r.result!.nsec).toMatch(/^nsec1/);
    expect(sw.server.accounts.get(FIX.ih)).toBeDefined();
    expect((await sw.cache())?.npub).toBe(r.result!.npub);
    const st = await sw.ui<StatusRes>(statusMsg);
    expect(st.result).toEqual({ unlocked: true, npub: r.result!.npub });
  });

  it('create on an existing identifier surfaces the conflict and saves nothing', async () => {
    sw.server.accounts.set(FIX.ih, { verifier: FIX.verifier, ncryptsec: FIX.ncryptsec });
    const r = await sw.ui({ cmd: 'create', identifier: ID, password: PW });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('already exists');
    expect(await sw.cache()).toBeUndefined();
    expect((await sw.ui<StatusRes>(statusMsg)).result!.unlocked).toBe(false);
  });

  it('importKey registers the wrapped nsec and unlocks it', async () => {
    const r = await sw.ui<NpubRes>({ cmd: 'importKey', nsec: FIX.nsec, identifier: ID, password: PW });
    expect(r.ok).toBe(true);
    expect(r.result).toEqual({ npub: FIX.npub });
    // NIP-49 wrapping is salted → the registered blob is a fresh wrapper of
    // the same key (cmdImportKey unlocking it proves that).
    expect(sw.server.accounts.get(FIX.ih)?.ncryptsec).toMatch(/^ncryptsec1/);
  });
});

describe('changePassword / erase / exportNsec', () => {
  let sw: SW;
  beforeEach(async () => {
    sw = await loadSW();
    sw.server.accounts.set(FIX.ih, { verifier: FIX.verifier, ncryptsec: FIX.ncryptsec });
  });

  it('changePassword requires an unlocked signer', async () => {
    const r = await sw.ui({ cmd: 'changePassword', identifier: ID, password: PW, newPassword: PW2 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('unlock first');
  });

  it('changePassword rotates the server verifier + blob and refreshes the cache', async () => {
    await sw.ui(loginMsg);
    const r = await sw.ui<NpubRes>({ cmd: 'changePassword', identifier: ID, password: PW, newPassword: PW2 });
    expect(r.ok).toBe(true);
    expect(r.result).toEqual({ npub: FIX.npub }); // identity is unchanged
    // server: old verifier dead, new blob stored
    expect(sw.server.accounts.get(FIX.ih)).toEqual({
      verifier: FIX.verifier2,
      ncryptsec: (await sw.cache())!.ncryptsec,
    });
    // the old password no longer authenticates anywhere (cache holds the PW2
    // blob now; the server holds the PW2 verifier)
    const old = await sw.ui({ ...loginMsg, password: PW });
    expect(old.ok).toBe(false);
    const fresh = await sw.ui<NpubRes>({ ...loginMsg, password: PW2 });
    expect(fresh.ok).toBe(true);
  });

  it('erase deletes server + cache and locks the signer', async () => {
    await sw.ui(loginMsg);
    const r = await sw.ui<{ erased: boolean }>({ cmd: 'erase', identifier: ID, password: PW });
    expect(r).toEqual({ ok: true, result: { erased: true } });
    expect(sw.server.accounts.get(FIX.ih)).toBeUndefined();
    expect(await sw.cache()).toBeUndefined();
    expect((await sw.ui<StatusRes>(statusMsg)).result).toEqual({ unlocked: false, npub: null });
  });

  it('exportNsec requires unlock; the real key surfaces only then', async () => {
    const locked = await sw.ui({ cmd: 'exportNsec' });
    expect(locked.ok).toBe(false);
    await sw.ui(loginMsg);
    const r = await sw.ui<{ nsec: string }>({ cmd: 'exportNsec' });
    expect(r.ok).toBe(true);
    expect(r.result!.nsec).toBe(FIX.nsec);
  });
});

// --- permission-gated page ops (prompt flow) ----------------------------------

describe('page ops and the approval prompt', () => {
  let sw: SW;
  beforeEach(async () => {
    sw = await loadSW();
    sw.server.accounts.set(FIX.ih, { verifier: FIX.verifier, ncryptsec: FIX.ncryptsec });
    await sw.ui(loginMsg);
  });

  const pageMsg = { src: 'page', method: 'getPublicKey', params: {}, host: 'app.nostr.com' };
  /** Answer the currently-open prompt window (nos2x semantics: `conditions`
   *  present = persist; absent = just-this-once). */
  const answerPrompt = (sw: SW, accept: boolean, conditions?: Record<string, unknown>) => {
    const win = sw.ctx.created.at(-1)!;
    const id = new URL(win.url).searchParams.get('id')!;
    return sw.send({
      prompt: true,
      id,
      host: 'app.nostr.com',
      method: 'getPublicKey',
      accept,
      ...(conditions ? { conditions } : {}),
    });
  };

  it('unseen site prompts; "just this once" answers but persists nothing', async () => {
    const p = sw.send<string>(pageMsg);
    await vi.waitFor(() => expect(sw.ctx.created).toHaveLength(1));
    void answerPrompt(sw, true);
    // page-facing getPublicKey is NIP-07 shape: hex, not npub
    expect(await p).toEqual({ result: FIX.hex });
    // No policy stored → the next call prompts again.
    const p2 = sw.send<string>(pageMsg);
    await vi.waitFor(() => expect(sw.ctx.created).toHaveLength(2));
    void answerPrompt(sw, true);
    expect(await p2).toEqual({ result: FIX.hex });
  });

  it('"always" persists the grant; later calls skip the prompt', async () => {
    const p = sw.send<string>(pageMsg);
    await vi.waitFor(() => expect(sw.ctx.created).toHaveLength(1));
    void answerPrompt(sw, true, {});
    expect(await p).toEqual({ result: FIX.hex });
    const p2 = sw.send<string>(pageMsg);
    expect(await p2).toEqual({ result: FIX.hex });
    expect(sw.ctx.created).toHaveLength(1);
  });

  it('"never" persists the deny; later calls are refused without a prompt', async () => {
    const p = sw.send<string>(pageMsg);
    await vi.waitFor(() => expect(sw.ctx.created).toHaveLength(1));
    void answerPrompt(sw, false, {});
    expect(await p).toEqual({ error: { message: 'denied' } });
    const p2 = sw.send<string>(pageMsg);
    expect(await p2).toEqual({ error: { message: 'denied' } });
    expect(sw.ctx.created).toHaveLength(1);
  });

  it('closing the prompt window counts as a deny and persists nothing', async () => {
    const p = sw.send<string>(pageMsg);
    await vi.waitFor(() => expect(sw.ctx.created).toHaveLength(1));
    sw.ctx.removedListeners.forEach((fn) => fn(sw.ctx.created[0].id));
    expect(await p).toEqual({ error: { message: 'denied' } });
    // still unset → prompts again
    const p2 = sw.send<string>(pageMsg);
    await vi.waitFor(() => expect(sw.ctx.created).toHaveLength(2));
    void answerPrompt(sw, true);
    expect(await p2).toEqual({ result: FIX.hex });
  });
});
