/** Unit tests for the locker REST client (fetch stubbed; no server). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, login, register } from "./api";

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
    await register({ identifierHash: HEX64, password: "pw", ncryptsec: "ncryptsec1x" });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/register");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      identifier_hash: HEX64,
      password: "pw",
      ncryptsec: "ncryptsec1x",
    });
  });

  it("maps 409 to ApiError(conflict)", async () => {
    stub(409);
    await expect(
      register({ identifierHash: HEX64, password: "pw", ncryptsec: "ncryptsec1x" }),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      register({ identifierHash: HEX64, password: "pw", ncryptsec: "ncryptsec1x" }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("maps other non-ok to register-failed", async () => {
    stub(500);
    await expect(
      register({ identifierHash: HEX64, password: "pw", ncryptsec: "ncryptsec1x" }),
    ).rejects.toMatchObject({ code: "register-failed" });
  });
});

describe("login", () => {
  it("returns the ncryptsec on 200", async () => {
    stub(200, { ncryptsec: "ncryptsec1abc" });
    await expect(login({ identifierHash: HEX64, password: "pw" })).resolves.toBe(
      "ncryptsec1abc",
    );
  });

  it("maps 401 to ApiError(unauthorized)", async () => {
    stub(401);
    await expect(login({ identifierHash: HEX64, password: "pw" })).rejects.toMatchObject({
      code: "unauthorized",
    });
  });
});
