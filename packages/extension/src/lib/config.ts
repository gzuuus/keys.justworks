/**
 * Extension config — just the API base, since the extension is never same-origin
 * with the server (`chrome-extension://<id>`). Persisted in `storage.local` so
 * self-hosters can point it at their own server from the options page. The
 * server runs an open CORS policy and auth is body-only, so a cross-origin
 * fetch from the SW works without `host_permissions`.
 */
import { setApiBase } from "@kj/core";

const STORAGE_KEY = "kj:config";

// Deployed production server (verified live, permissive CORS, open API).
const DEFAULT_API_BASE = "https://keys.justworks.cash/api";

export interface KjConfig {
  apiBase: string;
}

export async function getConfig(): Promise<KjConfig> {
  const v = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as KjConfig | undefined;
  const cfg: KjConfig = { apiBase: v?.apiBase ?? DEFAULT_API_BASE };
  setApiBase(cfg.apiBase);
  return cfg;
}

export async function setConfig(cfg: Partial<KjConfig>): Promise<KjConfig> {
  const current = await getConfig();
  const next: KjConfig = { ...current, ...cfg };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  setApiBase(next.apiBase);
  return next;
}
