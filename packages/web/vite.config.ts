import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Static output → packages/web/build/, embedded by the Rust server via
			// rust-embed for the single-binary prod artifact. SPA fallback so
			// client-side routes resolve without per-route prerender.
			adapter: adapter({ fallback: 'index.html' })
		})
	],
	// No inline modulepreload polyfill → SvelteKit's bootstrap is the ONLY inline
	// <script> in the built index.html. The Rust server hashes it and includes the
	// hash in the CSP header's script-src (see server/src/lib.rs). CSP is owned by
	// the server, not here: SvelteKit's csp config only emits a meta for
	// *prerendered* pages, and our SPA fallback isn't prerendered.
	build: { modulePreload: { polyfill: false } },
	server: {
		// Dev: proxy /api/* to the Rust server on :3000 so the bundled-site,
		// same-origin /api flow works in dev too.
		proxy: { '/api': 'http://localhost:3000' }
	}
});
