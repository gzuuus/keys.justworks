import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Static output → packages/web/build/, embedded by the Rust server via
			// rust-embed for the single-binary prod artifact. SPA fallback so
			// client-side routes resolve without per-route prerender.
			adapter: adapter({ fallback: 'index.html' })
		})
	],
	server: {
		// Dev: proxy /api/* to the Rust server on :3000 so the bundled-site,
		// same-origin /api flow works in dev too.
		proxy: {
			'/api': 'http://localhost:3000'
		}
	}
});
