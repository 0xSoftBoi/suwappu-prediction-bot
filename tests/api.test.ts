import { afterEach, describe, expect, it } from "bun:test";
import { predictionApi } from "../src/api";

const originalFetch = globalThis.fetch;
const originalEnv = {
  SUWAPPU_API_KEY: process.env.SUWAPPU_API_KEY,
  SUWAPPU_API_URL: process.env.SUWAPPU_API_URL,
  SUWAPPU_REQUEST_TIMEOUT_MS: process.env.SUWAPPU_REQUEST_TIMEOUT_MS,
  SUWAPPU_READ_RETRIES: process.env.SUWAPPU_READ_RETRIES,
  SUWAPPU_API_EVENTS: process.env.SUWAPPU_API_EVENTS,
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("prediction read client", () => {
  it("keeps public market research credential-free", async () => {
    delete process.env.SUWAPPU_API_KEY;
    let authorization = "unset";
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      authorization = (init?.headers as Record<string, string>)?.Authorization ?? "";
      return new Response(JSON.stringify({ markets: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    expect(await predictionApi.markets("bitcoin", 5)).toEqual([]);
    expect(authorization).toBe("");
  });

  it("encodes market IDs and forwards bounded read parameters", async () => {
    let url = "";
    globalThis.fetch = (async (input: string | URL | Request) => {
      url = String(input);
      return new Response(JSON.stringify({ marketId: "a/b?", trades: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    await predictionApi.trades("a/b?", 7);
    expect(url).toBe(
      "https://api.suwappu.bot/v1/agent/predict/market/a%2Fb%3F/trades?limit=7",
    );
  });

  it("requires a key before making an account-scoped request", async () => {
    delete process.env.SUWAPPU_API_KEY;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    expect(predictionApi.positions()).rejects.toThrow("SUWAPPU_API_KEY is required");
    expect(called).toBe(false);
  });

  it("retries safe reads on transient responses and honors Retry-After", async () => {
    process.env.SUWAPPU_READ_RETRIES = "1";
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response("busy", { status: 503, headers: { "retry-after": "0" } });
      }
      return new Response(JSON.stringify({ marketId: "market-1", question: "q", prices: [] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    expect((await predictionApi.price("market-1")).prices).toEqual([]);
    expect(attempts).toBe(2);
  });

  it("does not copy upstream response bodies into errors", async () => {
    process.env.SUWAPPU_READ_RETRIES = "0";
    const secretLookingBody = "internal diagnostic token=suwappu_sk_do_not_log";
    globalThis.fetch = (async () =>
      new Response(secretLookingBody, { status: 403 })) as unknown as typeof fetch;

    try {
      await predictionApi.book("market-1");
      throw new Error("expected request to fail");
    } catch (error) {
      expect(String(error)).toContain("HTTP 403");
      expect(String(error)).not.toContain(secretLookingBody);
      expect(String(error)).not.toContain("suwappu_sk_");
    }
  });

  it("fails closed on malformed successful JSON", async () => {
    globalThis.fetch = (async () =>
      new Response("not-json", { status: 200 })) as unknown as typeof fetch;
    expect(predictionApi.price("market-1")).rejects.toThrow(
      "Suwappu API returned invalid JSON for predict.price",
    );
  });
});
