/**
 * Unit tests for the keyholder dispatch logic (no Worker: the pure `KeyholderCore`).
 *
 * Exercises the NIP-07-shaped operations end-to-end against a real recorded
 * ncryptsec, plus lock/unlock state and the nip04/nip44 round-trips. Verifying
 * the actual Worker `postMessage` plumbing is left to manual browser testing.
 */
import { describe, expect, it } from "vitest";
import { generateSecretKey, getPublicKey, nip19, verifyEvent, type Event } from "nostr-tools";
import { encryptSecret } from "@kj/core";
import { KeyholderCore, type KeyholderReq } from "./core";

const ID = "alice@example.com";
const PW = "correct horse battery staple";
const SECRET = generateSecretKey();
const NCRYPTSEC = encryptSecret(SECRET, ID, PW);
const PUBKEY = getPublicKey(SECRET);
const N_PUB = nip19.npubEncode(PUBKEY);

let n = 0;
/** Build a wire message for `op`; payload defaults to undefined (void ops). */
function msg(op: string, payload: unknown = undefined): KeyholderReq {
  return { id: `r${n++}`, op, payload } as KeyholderReq;
}
function ok(core: KeyholderCore, m: KeyholderReq): unknown {
  const res = core.handle(m);
  if (!res.ok) throw new Error(`unexpected error: ${(res as { error: string }).error}`);
  return (res as { result: unknown }).result;
}
function err(core: KeyholderCore, m: KeyholderReq): string {
  const res = core.handle(m);
  if (res.ok) throw new Error("expected error, got ok");
  return (res as { error: string }).error;
}

describe("KeyholderCore lifecycle", () => {
  it("starts locked and refuses signing", () => {
    const core = new KeyholderCore();
    expect(core.unlocked).toBe(false);
    expect(err(core, msg("getPublicKey"))).toMatch(/locked/);
  });

  it("unlock → getPublicKey → lock", () => {
    const core = new KeyholderCore();
    expect(ok(core, msg("unlock", { ncryptsec: NCRYPTSEC, identifier: ID, password: PW }))).toEqual({
      pubkey: PUBKEY,
    });
    expect(core.unlocked).toBe(true);
    expect(ok(core, msg("getPublicKey"))).toBe(PUBKEY);
    expect(ok(core, msg("lock"))).toEqual({ locked: true });
    expect(core.unlocked).toBe(false);
    expect(err(core, msg("getPublicKey"))).toMatch(/locked/);
  });

  it("status reports pubkey when unlocked", () => {
    const core = new KeyholderCore();
    expect(ok(core, msg("status"))).toEqual({ unlocked: false, pubkey: null });
    ok(core, msg("unlock", { ncryptsec: NCRYPTSEC, identifier: ID, password: PW }));
    expect(ok(core, msg("status"))).toEqual({ unlocked: true, pubkey: PUBKEY });
  });

  it("unlock with a wrong password fails and stays locked", () => {
    const core = new KeyholderCore();
    expect(() => ok(core, msg("unlock", { ncryptsec: NCRYPTSEC, identifier: ID, password: "wrong" }))).toThrow();
    expect(core.unlocked).toBe(false);
  });
});

describe("KeyholderCore NIP-07 signing", () => {
  it("signEvent adds id, pubkey, sig and verifies", () => {
    const core = new KeyholderCore();
    ok(core, msg("unlock", { ncryptsec: NCRYPTSEC, identifier: ID, password: PW }));
    const event = ok(core, msg("signEvent", { event: { kind: 1, content: "hello from the worker", tags: [], created_at: 1_700_000_0000 } })) as Event;
    expect(event.pubkey).toBe(PUBKEY);
    expect(event.id).toHaveLength(64);
    expect(event.sig).toHaveLength(128);
    expect(verifyEvent(event)).toBe(true);
  });

  it("getPublicKey matches the npub registered for this key", () => {
    const core = new KeyholderCore();
    ok(core, msg("unlock", { ncryptsec: NCRYPTSEC, identifier: ID, password: PW }));
    expect(nip19.npubEncode(ok(core, msg("getPublicKey")) as string)).toBe(N_PUB);
  });
});

describe("KeyholderCore nip04 / nip44", () => {
  it("nip04 encrypt → decrypt round-trips (to self)", () => {
    const core = new KeyholderCore();
    ok(core, msg("unlock", { ncryptsec: NCRYPTSEC, identifier: ID, password: PW }));
    const enc = ok(core, msg("nip04.encrypt", { pubkey: PUBKEY, plaintext: "secret msg" })) as string;
    const dec = ok(core, msg("nip04.decrypt", { pubkey: PUBKEY, ciphertext: enc })) as string;
    expect(dec).toBe("secret msg");
  });

  it("nip44 encrypt → decrypt round-trips (to self)", () => {
    const core = new KeyholderCore();
    ok(core, msg("unlock", { ncryptsec: NCRYPTSEC, identifier: ID, password: PW }));
    const enc = ok(core, msg("nip44.encrypt", { pubkey: PUBKEY, plaintext: "nip44 payload 🚀" })) as string;
    const dec = ok(core, msg("nip44.decrypt", { pubkey: PUBKEY, ciphertext: enc })) as string;
    expect(dec).toBe("nip44 payload 🚀");
  });
});
