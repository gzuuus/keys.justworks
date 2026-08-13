import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";

// MV3 service worker + content scripts must be self-contained (no on-disk ESM
// graph at runtime), so we bundle everything. `target: chrome111` also enables
// the `world: "MAIN"` content-script field used by the page-context provider.
export default defineConfig({
  plugins: [svelte(), crx({ manifest })],
  build: {
    target: "chrome111",
    sourcemap: true,
  },
});
