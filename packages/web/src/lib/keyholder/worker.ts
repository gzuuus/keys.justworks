/// <reference lib="webworker" />
/**
 * Web Worker entry for the keyholder. Instantiates the pure handler and wires
 * `postMessage` I/O around it. The decrypted secret lives only in this Worker's
 * memory — the page never sees it.
 *
 * Idle auto-lock: every message resets a one-shot timer (IDLE_LOCK_MS, generous).
 * When it fires with no further activity, the held key is wiped and the page is
 * notified so its UI reflects the lock. The Worker owns this so a page that's
 * gone rogue can't keep the key alive.
 */
import {
	KeyholderCore,
	IDLE_LOCK_MS,
	type KeyholderNotification,
	type KeyholderReq,
	type KeyholderRes
} from './core';

const core = new KeyholderCore();
const post = (m: KeyholderRes | KeyholderNotification) =>
	(self as unknown as Worker).postMessage(m);

let idle: ReturnType<typeof setTimeout> | undefined;
function armIdleLock() {
	clearTimeout(idle);
	idle = setTimeout(() => {
		if (core.unlocked) {
			core.lock();
			post({ notification: 'auto-locked' });
		}
	}, IDLE_LOCK_MS);
}

self.onmessage = async (e: MessageEvent<KeyholderReq>) => {
	post(await core.handle(e.data));
	armIdleLock(); // any keyholder activity resets the idle window
};
