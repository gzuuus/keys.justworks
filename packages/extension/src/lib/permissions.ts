/**
 * Per-site permission model — mirrors nos2x's `common.js`. Each (host, method)
 * pair resolves to one of: allowed (with optional event-kind conditions),
 * denied, or unset (→ prompt). Stored in `storage.local` under `kj:policies`:
 *
 *   policies[host][acceptKey][method] = { conditions, createdAt }   (acceptKey: "true"|"false")
 *
 * For `signEvent`, a policy may carry `{ kinds: { 1: true } }` so the user can
 * "allow signing kind 1 forever" without blanket-approving every kind.
 * (accept is a string key because JSON round-trips object keys as strings and
 * TS forbids indexing with a boolean.)
 */
import type { Conditions, NostrMethod } from "./protocol";
import { isEmptyConditions } from "./protocol";

const STORAGE_KEY = "kj:policies";
const accKey = (accept: boolean): "true" | "false" => (accept ? "true" : "false");

interface StoredPolicy {
  conditions: Conditions;
  createdAt: number;
}
type Policies = Record<string, Record<string, Record<string, StoredPolicy>>>;

async function loadPolicies(): Promise<Policies> {
  try {
    return ((await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as Policies) ?? {};
  } catch {
    return {};
  }
}

async function savePolicies(p: Policies): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: p });
}

function matches(conditions: Conditions | undefined, eventKind?: number): boolean {
  if (!conditions?.kinds) return true; // no kind filter → matches everything
  if (eventKind === undefined) return false; // a kind filter with no event can't match
  return eventKind in conditions.kinds;
}

/**
 * Resolve a (host, method) request to a stored decision.
 * - `true`/`false`: an allow/deny policy matched.
 * - `undefined`: no policy → the SW must prompt.
 */
export async function getPermissionStatus(
  host: string,
  method: NostrMethod,
  eventKind?: number,
): Promise<boolean | undefined> {
  const policies = await loadPolicies();
  const byHost = policies[host];
  if (!byHost) return undefined;
  // Check allow first, then deny (nos2x ordering).
  for (const accept of [true, false]) {
    const entry = byHost[accKey(accept)]?.[method];
    if (!entry) continue;
    if (method === "signEvent") {
      if (matches(entry.conditions, eventKind)) return accept;
      continue; // this policy's kind filter doesn't match; keep looking
    }
    return accept;
  }
  return undefined;
}

export async function updatePermission(
  host: string,
  method: NostrMethod,
  accept: boolean,
  conditions: Conditions,
): Promise<void> {
  const policies = await loadPolicies();
  const conds: Conditions = isEmptyConditions(conditions) ? {} : conditions;

  // Merge kind conditions into any existing same-direction policy.
  const existing = policies[host]?.[accKey(accept)]?.[method];
  if (existing?.conditions?.kinds && conds.kinds) {
    for (const k of Object.keys(existing.conditions.kinds)) conds.kinds[Number(k)] = true;
  }

  // Drop the exact-same reverse policy (avoid contradictory duplicates).
  const reverse = policies[host]?.[accKey(!accept)]?.[method];
  if (reverse && JSON.stringify(reverse.conditions) === JSON.stringify(conds)) {
    delete policies[host][accKey(!accept)][method];
  }

  policies[host] ??= {};
  policies[host][accKey(accept)] ??= {};
  policies[host][accKey(accept)][method] = { conditions: conds, createdAt: Date.now() };
  await savePolicies(policies);
}

export async function removePermission(
  host: string,
  accept: boolean,
  method: NostrMethod,
): Promise<void> {
  const policies = await loadPolicies();
  delete policies[host]?.[accKey(accept)]?.[method];
  await savePolicies(policies);
}

export interface PermissionEntry {
  host: string;
  accept: boolean;
  method: NostrMethod;
  conditions: Conditions;
  createdAt: number;
}

export async function listPermissions(): Promise<PermissionEntry[]> {
  const policies = await loadPolicies();
  const out: PermissionEntry[] = [];
  for (const [host, byAccept] of Object.entries(policies)) {
    for (const [acceptKey, byMethod] of Object.entries(byAccept)) {
      const accept = acceptKey === "true";
      for (const [method, entry] of Object.entries(byMethod)) {
        out.push({
          host,
          accept,
          method: method as NostrMethod,
          conditions: entry.conditions,
          createdAt: entry.createdAt,
        });
      }
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}
