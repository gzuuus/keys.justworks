import { defineManifest } from "@crxjs/vite-plugin";

// MV3 manifest. Two content scripts on every page:
//   - `provider.ts` runs in the page's MAIN world and sets `window.nostr`.
//   - `content-script.ts` runs in the ISOLATED world and bridges
//     `window.postMessage` ↔ `chrome.runtime` (the service worker).
// They share `window`, so they talk via postMessage — the nos2x pattern, but
// using MV3's native `world: "MAIN"` instead of a script-injection hack
// (Chrome 111+). The prompt window is opened at runtime via
// `chrome.runtime.getURL`, so it lives in `web_accessible_resources`.
export default defineManifest({
  manifest_version: 3,
  name: "keys.justworks",
  version: "0.0.1",
  description: "Non-custodial Nostr key locker — NIP-07 signer.",
  action: {
    default_title: "keys.justworks",
    default_popup: "src/popup/index.html",
  },
  options_ui: { page: "src/options/index.html" },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  content_scripts: [
    {
      run_at: "document_end",
      matches: ["<all_urls>"],
      all_frames: true,
      world: "MAIN",
      js: ["src/provider.ts"],
    },
    {
      run_at: "document_end",
      matches: ["<all_urls>"],
      all_frames: true,
      js: ["src/content-script.ts"],
    },
  ],
  web_accessible_resources: [
    {
      resources: ["src/prompt/index.html"],
      matches: ["<all_urls>"],
    },
  ],
  permissions: ["storage", "activeTab", "windows", "alarms"],
});
