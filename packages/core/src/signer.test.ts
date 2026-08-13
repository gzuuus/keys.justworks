/**
 * Self-check for the shared signer: unlock a freshly-wrapped key, read its
 * pubkey, sign an event, validate it, then lock and confirm it's gone. Fails if
 * the dispatch wiring breaks. (The byte-identical crypto contract is locked by
 * `index.test.ts`; this covers the dispatch layer on top of it.)
 */
import { describe, it, expect } from "vitest";
import { generateSecretKey, getPublicKey, validateEvent } from "nostr-tools";
import * as nip19 from "nostr-tools/nip19";
import { encryptSecret } from "./index";
import { SignerCore } from "./signer";

const ID = "ext-signer@example.com";
const PW = "correct horse battery staple";

function req(op: any, payload: any): any {
  return { id: crypto.randomUUID(), op, payload };
}

describe("SignerCore", () => {
  it("unlocks, reports pubkey/status, signs a valid event, then locks", async () => {
    const sk = generateSecretKey();
    const expectedPubkey = getPublicKey(sk);
    const ncryptsec = encryptSecret(sk, ID, PW);

    const signer = new SignerCore();
    expect(signer.unlocked).toBe(false);

    const unlock = await signer.handle(req("unlock", { ncryptsec, identifier: ID, password: PW }));
    expect(unlock.ok).toBe(true);
    expect((unlock as any).result.npub).toMatch(/^npub1/);

    const status = await signer.handle(req("status", undefined));
    expect((status as any).result).toEqual({
      unlocked: true,
      npub: nip19.npubEncode(expectedPubkey),
    });

    const pk = await signer.handle(req("getPublicKey", undefined));
    expect((pk as any).result).toBe(expectedPubkey);

    const signed = await signer.handle(
      req("signEvent", { event: { kind: 1, created_at: 1, tags: [], content: "hi" } }),
    );
    expect(signed.ok).toBe(true);
    expect(validateEvent((signed as any).result)).toBe(true);

    const locked = await signer.handle(req("lock", undefined));
    expect((locked as any).result).toEqual({ locked: true });
    expect(signer.unlocked).toBe(false);

    const afterLock = await signer.handle(req("getPublicKey", undefined));
    expect(afterLock.ok).toBe(false);
  });

  it("create round-trips through decrypt (generated key never held, but wrapped key is sound)", async () => {
    const signer = new SignerCore();
    const created = await signer.handle(req("create", { identifier: ID, password: PW }));
    expect(created.ok).toBe(true);
    const { ncryptsec, npub } = (created as any).result;
    expect(ncryptsec).toMatch(/^ncryptsec1/);
    expect(npub).toMatch(/^npub1/);

    // unlock with the same passphrase and confirm the npub matches.
    const unlocked = await signer.handle(
      req("unlock", { ncryptsec, identifier: ID, password: PW }),
    );
    expect((unlocked as any).result.npub).toBe(npub);
  });
});
