/**
 * keys.justworks extension — service worker (the keyholder).
 *
 * The isolated context that holds the decrypted secret in memory and does all
 * crypto. Mirrors the website's Web-Worker keyholder, but the I/O is
 * `chrome.runtime` messages instead of `postMessage`, and it owns the full
 * account lifecycle (login / onboarding / password change / erase) instead of
 * just signing.
 *
 * Three message channels (see `lib/protocol.ts`):
 *   - page (content-script → here): NIP-07 ops, permission-gated.
 *   - ui (popup/options → here): privileged lifecycle, no gating.
 *   - prompt (prompt window → here): the user's allow/deny decision.
 *
 * Security: the decrypted key lives ONLY here in `SignerCore`'s memory. It is
 * wiped on `lock`, on idle auto-lock, and whenever Chrome reclaims the SW (a
 * fresh SW is locked). The `ncryptsec` cache in `storage.local` is encrypted
 * (passphrase = identifier‖password) — never the plaintext key or identifier.
 */
import {
  SignerCore,
  IDLE_LOCK_MS,
  identifierHash,
  passwordSecret,
  login,
  register,
  updateBlob,
  deleteAccount,
  ApiError,
  type SignerOp,
  type SignerOps,
  type SignerReq,
} from "@kj/core";
import * as accounts from "../lib/accounts";
import * as permissions from "../lib/permissions";
import { fetchLatestUpdate, isNewer, UPDATE_KEY, type UpdateInfo } from "../lib/update";
import { getConfig, setConfig } from "../lib/config";
import type {
  BgMessage,
  BgPageRequest,
  BgPromptReply,
  BgUiMessage,
  NostrMethod,
} from "../lib/protocol";

const signer = new SignerCore();

// Apply the stored (or default) API base before any REST call. The extension is
// never same-origin with the server, so this must override core's `/api` default.
void getConfig();
// One staleness-guarded fetch per SW boot at most (the 6h alarm covers
// long-running browsers; boot checks cover daily-restarted ones).
void maybeCheckForUpdate();

// --- keepalive + idle auto-lock ---------------------------------------------
// Chrome kills an idle MV3 service worker (~30s). When that happens the held key
// is wiped (a fresh SW is locked) — that is a free auto-lock and the property
// the design wants ("never persist the decrypted key"). The alarm below is a
// best-effort keepalive AND the idle-lock backstop: it fires every 30s, and if
// the SW is still alive but idle beyond IDLE_LOCK_MS, it locks explicitly.
const ALARM = "kj-tick";
let lastActivity = Date.now();
chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === UPDATE_ALARM) {
    void refreshUpdate();
    return;
  }
  if (signer.unlocked && Date.now() - lastActivity > IDLE_LOCK_MS) signer.lock();
});
function bump() {
  lastActivity = Date.now();
}

// --- self-update detection -----------------------------------------------
// Chrome doesn't apply update_url updates for drag-installed CRXs (Linux/policy
// installs only), so we poll our own update.xml and badge the toolbar icon when
// the server advertises something newer. The popup turns the badge into a
// banner with a download link.
const UPDATE_ALARM = "kj-update";
const UPDATE_EVERY_MS = 6 * 60 * 60 * 1000;

// Create-once (not every SW boot, unlike the short-period tick above): a
// top-level create would reset the 6h window on every SW wake and starve it.
void chrome.alarms.get(UPDATE_ALARM).then((a) => {
  if (!a) chrome.alarms.create(UPDATE_ALARM, { periodInMinutes: 360 });
});

async function refreshUpdate(): Promise<void> {
  const { apiBase } = await getConfig();
  const latest = await fetchLatestUpdate(apiBase);
  // Unreachable / not synced: keep whatever we knew before (don't blink the
  // badge on a flaky network, don't clear a valid notice).
  if (!latest) return;
  const current = chrome.runtime.getManifest().version;
  const info: UpdateInfo | null = isNewer(latest.version, current)
    ? { latest: latest.version, checkedAt: Date.now() }
    : null;
  await chrome.storage.local.set({ [UPDATE_KEY]: info });
  chrome.action.setBadgeText({ text: info ? "•" : "" });
  if (info) chrome.action.setBadgeBackgroundColor({ color: "#F59E0B" });
}

async function maybeCheckForUpdate(): Promise<void> {
  const stored = (await chrome.storage.local.get(UPDATE_KEY))[UPDATE_KEY] as
    | UpdateInfo
    | null
    | undefined;
  if (!stored || Date.now() - stored.checkedAt > UPDATE_EVERY_MS) await refreshUpdate();
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") chrome.runtime.openOptionsPage();
  // install/update: re-evaluate immediately (clears a stale badge after the
  // user updates, sets it on a fresh install if the server is ahead).
  void refreshUpdate();
});

// --- signer dispatch helper -------------------------------------------------

function signerCall<K extends SignerOp>(
  op: K,
  payload: SignerOps[K]["req"],
): Promise<SignerOps[K]["res"]> {
  return signer.handle({ id: crypto.randomUUID(), op, payload } as SignerReq).then((res) => {
    if (!res.ok) throw new Error(res.error);
    return res.result as SignerOps[K]["res"];
  });
}

const unlock = (ncryptsec: string, identifier: string, password: string) =>
  signerCall("unlock", { ncryptsec, identifier, password });

// --- lifecycle orchestration (privileged UI commands) -----------------------

async function cmdLogin(identifier: string, password: string): Promise<{ npub: string }> {
  const ih = await identifierHash(identifier);
  const cached = await accounts.lookup(ih);
  // Prefer the cached blob (offline, no round-trip); the server is the
  // authoritative fallback when the cache is missing, stale, or tampered.
  if (cached) {
    try {
      const r = await unlock(cached.ncryptsec, identifier, password);
      if (r.npub === cached.npub) {
        await accounts.touch(ih);
        return { npub: r.npub };
      }
      await accounts.remove(ih); // npub mismatch → swapped/stale blob
    } catch {
      // decrypt failed: wrong password or stale cache → fall through to server
    }
  }
  const ps = await passwordSecret(identifier, password);
  const ncryptsec = await login({ identifierHash: ih, passwordSecret: ps });
  const r = await unlock(ncryptsec, identifier, password);
  await accounts.save(ih, ncryptsec, r.npub);
  return { npub: r.npub };
}

/** Onboarding: generate a fresh key, register it, unlock, cache. Returns the
 * npub + the one-time nsec backup (the only moment the raw key surfaces). */
async function cmdCreate(identifier: string, password: string): Promise<{ npub: string; nsec: string }> {
  const created = await signerCall("create", { identifier, password });
  const ih = await identifierHash(identifier);
  await register({ identifierHash: ih, passwordSecret: created.passwordSecret, ncryptsec: created.ncryptsec });
  await unlock(created.ncryptsec, identifier, password);
  await accounts.save(ih, created.ncryptsec, created.npub);
  return { npub: created.npub, nsec: created.nsec };
}

/** Onboarding: wrap an existing nsec, register it, unlock, cache. */
async function cmdImportKey(nsec: string, identifier: string, password: string): Promise<{ npub: string }> {
  const imported = await signerCall("import", { nsec, identifier, password });
  const ih = await identifierHash(identifier);
  await register({ identifierHash: ih, passwordSecret: imported.passwordSecret, ncryptsec: imported.ncryptsec });
  await unlock(imported.ncryptsec, identifier, password);
  await accounts.save(ih, imported.ncryptsec, imported.npub);
  return { npub: imported.npub };
}

/** Rotate the passphrase: re-wrap the held key, update both stored fields on
 * the server, refresh the cache. The key itself is unchanged. */
async function cmdChangePassword(
  identifier: string,
  password: string,
  newPassword: string,
): Promise<{ npub: string }> {
  const ih = await identifierHash(identifier);
  const status = await signerCall("status", undefined);
  if (!status.unlocked || !status.npub) throw new Error("unlock first to change password");
  const rewrapped = await signerCall("reencrypt", { identifier, newPassword });
  await updateBlob({
    identifierHash: ih,
    passwordSecret: await passwordSecret(identifier, password),
    newNcryptsec: rewrapped.ncryptsec,
    newPasswordSecret: await passwordSecret(identifier, newPassword),
  });
  await accounts.save(ih, rewrapped.ncryptsec, status.npub);
  return { npub: status.npub };
}

async function cmdErase(identifier: string, password: string): Promise<void> {
  const ih = await identifierHash(identifier);
  await deleteAccount({ identifierHash: ih, passwordSecret: await passwordSecret(identifier, password) });
  await accounts.remove(ih);
  signer.lock();
}

// --- permission-gated page (NIP-07) ops -------------------------------------

type PageEnvelope = { result?: unknown; error?: { message: string } };

function perform(method: NostrMethod, params: Record<string, unknown>): Promise<unknown> {
  switch (method) {
    case "getPublicKey":
      return signerCall("getPublicKey", undefined);
    case "signEvent":
      return signerCall("signEvent", { event: params.event as never });
    case "nip04.encrypt":
      return signerCall("nip04.encrypt", { pubkey: params.peer as string, plaintext: params.plaintext as string });
    case "nip04.decrypt":
      return signerCall("nip04.decrypt", { pubkey: params.peer as string, ciphertext: params.ciphertext as string });
    case "nip44.encrypt":
      return signerCall("nip44.encrypt", { pubkey: params.peer as string, plaintext: params.plaintext as string });
    case "nip44.decrypt":
      return signerCall("nip44.decrypt", { pubkey: params.peer as string, ciphertext: params.ciphertext as string });
  }
}

// Serialize the page flow so concurrent prompts can't race on policy writes
// (nos2x uses a mutex for the same reason). One prompt at a time.
let tail: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn) as Promise<T>;
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function handlePage(req: BgPageRequest): Promise<PageEnvelope> {
  return serialize(async () => {
    const eventKind = req.method === "signEvent" ? (req.params.event as { kind?: number })?.kind : undefined;
    const status = await permissions.getPermissionStatus(req.host, req.method, eventKind);
    let allowed = status;
    if (allowed === undefined) {
      allowed = await askPermission(req.host, req.method, req.params, eventKind);
      if (!allowed) return { error: { message: "denied" } };
    } else if (allowed === false) {
      return { error: { message: "denied" } };
    }
    try {
      return { result: await perform(req.method, req.params) };
    } catch (e) {
      return { error: { message: e instanceof Error ? e.message : "signer error" } };
    }
  });
}

// --- prompt window ----------------------------------------------------------

const PROMPT_W = 420;
const PROMPT_H = 480;
let openPrompt: { id: string; winId?: number; resolve: (accept: boolean) => void } | null = null;

async function center(w: number, h: number): Promise<{ top: number; left: number }> {
  const win = await chrome.windows.getLastFocused();
  const top = Math.round((win.top ?? 0) + ((win.height ?? h) - h) / 2);
  const left = Math.round((win.left ?? 0) + ((win.width ?? w) - w) / 2);
  return { top, left };
}

async function askPermission(
  host: string,
  method: NostrMethod,
  params: Record<string, unknown>,
  eventKind: number | undefined,
): Promise<boolean> {
  const id = crypto.randomUUID();
  const qs = new URLSearchParams({
    id,
    host,
    method,
    params: JSON.stringify(params),
    kind: eventKind === undefined ? "" : String(eventKind),
  });
  const { top, left } = await center(PROMPT_W, PROMPT_H);
  return new Promise<boolean>((resolve) => {
    openPrompt = { id, resolve };
    chrome.windows.create({
      url: chrome.runtime.getURL("src/prompt/index.html") + "?" + qs.toString(),
      type: "popup",
      width: PROMPT_W,
      height: PROMPT_H,
      top,
      left,
    }).then((win) => {
      if (openPrompt?.id === id) openPrompt.winId = win.id;
    });
  });
}

chrome.windows.onRemoved.addListener((winId) => {
  // Closing the prompt without deciding = deny (and store nothing).
  if (openPrompt && (openPrompt.winId === winId || openPrompt.winId === undefined)) {
    const p = openPrompt;
    openPrompt = null;
    p.resolve(false);
  }
});

function handlePromptReply(msg: BgPromptReply, sender: chrome.runtime.MessageSender): void {
  const p = openPrompt;
  openPrompt = null;
  if (p) p.resolve(msg.accept);
  // Persist only on a "forever" choice (conditions present, even if `{}`); a
  // bare "just this" / "reject" omits conditions and re-prompts next time
  // (nos2x semantics).
  if (msg.conditions !== undefined) {
    void permissions.updatePermission(msg.host, msg.method, msg.accept, msg.conditions);
  }
  if (sender.tab?.windowId) chrome.windows.remove(sender.tab.windowId).catch(() => {});
}

// --- message router ---------------------------------------------------------

function ok<T>(result: T): { ok: true; result: T } {
  return { ok: true, result };
}
function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

async function handleUi(msg: BgUiMessage): Promise<unknown> {
  switch (msg.cmd) {
    case "status":
      return signerCall("status", undefined);
    case "login":
      return cmdLogin(msg.identifier, msg.password);
    case "lock":
      signer.lock();
      return { locked: true };
    case "create":
      return cmdCreate(msg.identifier, msg.password);
    case "importKey":
      return cmdImportKey(msg.nsec, msg.identifier, msg.password);
    case "changePassword":
      return cmdChangePassword(msg.identifier, msg.password, msg.newPassword);
    case "exportNsec":
      return signerCall("exportNsec", undefined);
    case "erase":
      await cmdErase(msg.identifier, msg.password);
      return { erased: true };
    case "getConfig":
      return getConfig();
    case "setConfig":
      return setConfig({ apiBase: msg.apiBase });
    case "cachedAccounts":
      return accounts.list();
    case "removeCached":
      await accounts.remove(msg.id);
      return { removed: true };
    case "listPermissions":
      return permissions.listPermissions();
    case "removePermission":
      await permissions.removePermission(msg.host, msg.accept, msg.method);
      return { removed: true };
  }
}

chrome.runtime.onMessage.addListener((msg: BgMessage, sender, sendResponse) => {
  bump();
  (async (): Promise<unknown> => {
    try {
      if (typeof msg === "object" && msg !== null && "src" in msg && msg.src === "page") {
        return await handlePage(msg as BgPageRequest); // → PageEnvelope for content-script
      }
      if (typeof msg === "object" && msg !== null && "prompt" in msg) {
        handlePromptReply(msg as BgPromptReply, sender);
        return ok(undefined);
      }
      if (typeof msg === "object" && msg !== null && "src" in msg && msg.src === "ui") {
        return ok(await handleUi(msg as BgUiMessage));
      }
      return fail("unknown message");
    } catch (e) {
      // Page envelopes already carry their own error; only UI/prompt land here.
      console.error("[kj] handler error:", e);
      const message = e instanceof Error ? e.message : "error";
      if (e instanceof ApiError) return fail(e.message);
      return fail(message);
    }
  })().then(
    // Always call sendResponse (fulfilled OR rejected) so the caller — popup,
    // options, content-script — never hangs forever on a message with no reply.
    (r) => sendResponse(r),
    (e) => {
      console.error("[kj] unhandled handler rejection:", e);
      sendResponse(fail("internal error"));
    },
  );
  return true; // async response
});
