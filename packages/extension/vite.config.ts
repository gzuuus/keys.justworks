import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";

// MV3 service worker + content scripts must be self-contained (no on-disk ESM
// graph at runtime), so we bundle everything. The page-context provider is a
// static asset (public/provider.js) injected by the content script, not a
// built entry — see manifest.config.ts.
export default defineConfig({
  plugins: [svelte(), crx({ manifest })],
  build: {
    target: "chrome111",
    // ponytail: sourcemaps off — crxjs 2.7.1 mis-emits content-script bundles
    // with sourcemaps on: the //# sourceMappingURL line strands the IIFE's
    // invocation (})()) on the same line, commenting it out -> SyntaxError ->
    // the script never runs (no window.nostr). Re-enable (try "hidden") once
    // crxjs fixes it.
    sourcemap: false,
    rollupOptions: {
      // crxjs compiles HTML in manifest fields (popup/options) but only COPIES
      // web_accessible_resources verbatim. The approval prompt is opened at
      // runtime via chrome.runtime.getURL, so declare it as a rollup input to
      // make Vite compile it (rewrite ./main.ts to a built chunk) — otherwise
      // main.ts 404s and the prompt renders blank.
      input: { prompt: "src/prompt/index.html" },
    },
  },
});
