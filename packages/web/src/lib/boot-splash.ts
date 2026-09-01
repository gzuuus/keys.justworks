/**
 * keys.justworks — boot splash handoff.
 *
 * `app.html` paints a static, on-brand splash (styled from
 * `static/boot-splash.css` — CSP allows no inline styles) while the SPA
 * boots. This removes it once the app surface that owns the first paint
 * is ready: the intro reel stamps its first frame, the homepage hero
 * starts its reveal, or any other route mounts. The
 * splash lives outside SvelteKit's mount container, so it survives mounting
 * and must be dismissed explicitly — no-op after the first call.
 */
export function dismissBootSplash(): void {
	document.getElementById('boot-splash')?.remove();
}
