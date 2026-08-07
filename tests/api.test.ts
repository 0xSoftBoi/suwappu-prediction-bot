import { afterEach, describe, expect, it } from "bun:test";
import { predictionApi } from "../src/api";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.SUWAPPU_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.SUWAPPU_API_KEY;
  else process.env.SUWAPPU_API_KEY = originalApiKey;
});

describe("prediction read bridge", () => {
  it("encodes market IDs, forwards bounded read parameters, and authenticates", async () => {
    let url = "";
    let authorization = "";
    process.env.SUWAPPU_API_KEY = "test-key";
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      url = String(input);
      authorization = (init?.headers as Record<string, string>)?.Authorization ?? "";
      return new Response(JSON.stringify({ marketId: "a/b?", trades: [] }), { status: 200 });
    }) as typeof fetch;

    await predictionApi.trades("a/b?", 7);

    expect(url).toBe(
      "https://api.suwappu.bot/v1/agent/predict/market/a%2Fb%3F/trades?limit=7",
    );
    expect(authorization).toBe("Bearer test-key");
  });

  it("preserves upstream error context", async () => {
    globalThis.fetch = (async () =>
      new Response("venue unavailable", { status: 503 })) as unknown as typeof fetch;
    expect(predictionApi.book("market-1")).rejects.toThrow(
      "Suwappu API error 503: venue unavailable",
    );
  });

  it("fails clearly on malformed successful JSON", async () => {
    globalThis.fetch = (async () =>
      new Response("not-json", { status: 200 })) as unknown as typeof fetch;
    expect(predictionApi.price("market-1")).rejects.toThrow(
      "Suwappu API returned invalid JSON",
    );
  });
});
