/**
 * keys.justworks — app-scoped keyholder singleton.
 *
 * One Web Worker keyholder for the whole app session, so an unlocked key
 * survives navigation (e.g. /login → /bunker). The Worker is created lazily on
 * first use; the held key is wiped after idle (see core.ts IDLE_LOCK_MS) and on
 * explicit `lock()`. A page reload drops it (never persist) — by design.
 *
 * Reactive state (`npub`, `locked`, `autoLocked`) is driven only by the
 * lifecycle ops that hold the key (unlock/lock/auto-lock). The registration
 * helpers (`create`/`import`/`passwordSecret`) are one-shot offloads: they
 * reuse the Worker but do NOT hold the key, so they leave the reactive state
 * untouched.
 *
 * The NIP-07 surface (`getPublicKey`/`signEvent`/`nip04`/`nip44`) is exposed
 * here too — the upcoming NIP-46 provider wraps this same surface (via a thin
 * ISigner adapter), so the raw `Keyholder` never has to leak to a page.
 */
import type { EventTemplate } from 'nostr-tools';
import { createKeyholder, type Keyholder } from './client';

class KeyholderStore {
	#holder: Keyholder | null = null;

	/** The held key's npub, or null when no key is held. */
	npub = $state<string | null>(null);
	/** The identifier the key was unlocked with (a locator, not a secret). Kept so
	 * the dashboard's Advanced ops (change password / erase) can re-derive
	 * `identifierHash` without re-asking. Cleared on lock. */
	identifier = $state<string | null>(null);
	/** False only while a key is held in the Worker. */
	locked = $state(true);
	/** True after the Worker auto-locked on idle (cleared by unlock/manual lock). */
	autoLocked = $state(false);

	/** Lazily create the shared Worker; wire idle auto-lock to reactive state. */
	get holder(): Keyholder {
		if (!this.#holder) {
			this.#holder = createKeyholder();
			this.#holder.onAutoLock = () => {
				this.locked = true;
				this.npub = null;
				this.identifier = null;
				this.autoLocked = true;
			};
		}
		return this.#holder;
	}

	/** One-shot registration offload — key NOT held, reactive state unchanged. */

	create(identifier: string, password: string) {
		return this.holder.create(identifier, password);
	}
	import(nsec: string, identifier: string, password: string) {
		return this.holder.import(nsec, identifier, password);
	}
	passwordSecret(identifier: string, password: string) {
		return this.holder.passwordSecret(identifier, password);
	}
	/** Re-wrap the held key under a new passphrase (password change). */
	reencrypt(identifier: string, newPassword: string) {
		return this.holder.reencrypt(identifier, newPassword);
	}

	/** Lifecycle — holds the key, updates reactive state. */

	async unlock(ncryptsec: string, identifier: string, password: string) {
		const res = await this.holder.unlock(ncryptsec, identifier, password);
		this.npub = res.npub;
		this.identifier = identifier;
		this.locked = false;
		this.autoLocked = false;
		return res;
	}

	lock() {
		this.holder.lock();
		this.locked = true;
		this.npub = null;
		this.identifier = null;
		this.autoLocked = false; // manual lock isn't an idle auto-lock
	}

	/** NIP-07 signing surface (passthrough; no reactive change). */

	getPublicKey() {
		return this.holder.getPublicKey();
	}
	/** Re-show the held key as an nsec for backup (no password — already unlocked). */
	exportNsec() {
		return this.holder.exportNsec();
	}
	signEvent(event: EventTemplate) {
		return this.holder.signEvent(event);
	}
	get nip04() {
		return this.holder.nip04;
	}
	get nip44() {
		return this.holder.nip44;
	}
}

/** App-wide keyholder singleton. One Worker for the session. */
export const keyholder = new KeyholderStore();
