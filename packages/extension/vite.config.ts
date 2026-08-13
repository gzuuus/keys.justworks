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
    sourcemap: true,
  },
});
