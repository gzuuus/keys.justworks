/// <reference lib="webworker" />
/**
 * Web Worker entry for the keyholder. Instantiates the pure handler and wires
 * `postMessage` I/O around it. The decrypted secret lives only in this Worker's
 * memory — the page never sees it.
 */
import { KeyholderCore, type KeyholderReq, type KeyholderRes } from "./core";

const core = new KeyholderCore();

self.onmessage = (e: MessageEvent<KeyholderReq>) => {
  const res: KeyholderRes = core.handle(e.data);
  (self as unknown as Worker).postMessage(res);
};
