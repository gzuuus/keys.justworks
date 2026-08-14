import { defineManifest } from "@crxjs/vite-plugin";

// MV3 manifest. One content script (`content-script.ts`, ISOLATED world) on
// every page at document_start. It injects `public/provider.js` into the
// page's MAIN world as a <script src> (the nos2x pattern — runs in page
// context on every Chrome, CSP-exempt) which sets `window.nostr` (NIP-07),
// then bridges window.postMessage ↔ chrome.runtime (the service worker). We
// don't use a `world: "MAIN"` content script: crxjs mis-handles those
// (github.com/crxjs/chrome-extension-tools/issues/695). The prompt window is
// opened at runtime via `chrome.runtime.getURL`, so it lives in
// `web_accessible_resources`.
export default defineManifest({
  manifest_version: 3,
  name: "keys.justworks",
  version: "0.0.4",
  description: "Non-custodial Nostr key locker — NIP-07 signer.",
  // Self-hosted auto-update: Chrome polls this GUpdate manifest and pulls the
  // new .crx from the same origin when the version bumps. Release CI packs it
  // (crx3 -x); deployments serve it via scripts/sync-extension.sh — see
  // docs/extension-release.md. The Web Store overrides update_url, so this is
  // harmless if we ever publish there.
  update_url: "https://keys.justworks.cash/extension/update.xml",
  icons: { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" },
  action: {
    default_title: "keys.justworks",
    default_popup: "src/popup/index.html",
    default_icon: { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" },
  },
  // open_in_tab: a full page instead of the embedded chrome://extensions panel —
  // the options page is the extension's manage surface, not a settings panel.
  options_ui: { page: "src/options/index.html", open_in_tab: true },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  content_scripts: [
    {
      run_at: "document_start",
      matches: ["<all_urls>"],
      all_frames: true,
      js: ["src/content-script.ts"],
    },
  ],
  web_accessible_resources: [
    {
      resources: ["provider.js", "src/prompt/index.html"],
      matches: ["<all_urls>"],
    },
  ],
  permissions: ["storage", "activeTab", "windows", "alarms"],
});
