/** Unit tests for the locker REST client (fetch stubbed; no server). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, deleteAccount, login, register, updateBlob } from "./api";

afterEach(() => vi.unstubAllGlobals());

/** Stub `fetch` to return `status` with a JSON `body`; return the mock. */
function stub(status: number, body: unknown = {}): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

const HEX64 = "a".repeat(64);

describe("register", () => {
  it("POSTs to /api/register with snake_case body", async () => {
    const f = stub(201);
    await register({ identifierHash: HEX64, passwordSecret: "secret", ncryptsec: "ncryptsec1x" });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/register");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      identifier_hash: HEX64,
      password_secret: "secret",
      ncryptsec: "ncryptsec1x",
    });
  });

  it("maps 409 to ApiError(conflict)", async () => {
    stub(409);
    await expect(
      register({ identifierHash: HEX64, passwordSecret: "secret", ncryptsec: "ncryptsec1x" }),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      register({ identifierHash: HEX64, passwordSecret: "secret", ncryptsec: "ncryptsec1x" }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("maps other non-ok to register-failed", async () => {
    stub(500);
    await expect(
      register({ identifierHash: HEX64, passwordSecret: "secret", ncryptsec: "ncryptsec1x" }),
    ).rejects.toMatchObject({ code: "register-failed" });
  });
});

describe("updateBlob", () => {
  it("PUTs to /api/blob with snake_case body; omits new_password_secret when undefined", async () => {
    const f = stub(200);
    await updateBlob({
      identifierHash: HEX64,
      passwordSecret: "old",
      newNcryptsec: "ncryptsec1new",
    });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/blob");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({
      identifier_hash: HEX64,
      password_secret: "old",
      new_ncryptsec: "ncryptsec1new",
    });
  });

  it("includes new_password_secret on a password change", async () => {
    const f = stub(200);
    await updateBlob({
      identifierHash: HEX64,
      passwordSecret: "old",
      newNcryptsec: "ncryptsec1new",
      newPasswordSecret: "new",
    });
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({
      identifier_hash: HEX64,
      password_secret: "old",
      new_ncryptsec: "ncryptsec1new",
      new_password_secret: "new",
    });
  });

  it("maps 401 to unauthorized", async () => {
    stub(401);
    await expect(
      updateBlob({ identifierHash: HEX64, passwordSecret: "old", newNcryptsec: "x" }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });
});

describe("deleteAccount", () => {
  it("DELETEs to /api/account with snake_case body", async () => {
    const f = stub(200);
    await deleteAccount({ identifierHash: HEX64, passwordSecret: "secret" });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/account");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body)).toEqual({
      identifier_hash: HEX64,
      password_secret: "secret",
    });
  });

  it("maps 401 to unauthorized", async () => {
    stub(401);
    await expect(
      deleteAccount({ identifierHash: HEX64, passwordSecret: "secret" }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });
});

describe("login", () => {
  it("returns the ncryptsec on 200", async () => {
    stub(200, { ncryptsec: "ncryptsec1abc" });
    await expect(login({ identifierHash: HEX64, passwordSecret: "secret" })).resolves.toBe(
      "ncryptsec1abc",
    );
  });

  it("maps 401 to ApiError(unauthorized)", async () => {
    stub(401);
    await expect(login({ identifierHash: HEX64, passwordSecret: "secret" })).rejects.toMatchObject({
      code: "unauthorized",
    });
  });
});
