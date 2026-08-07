import { describe, expect, it } from "bun:test";
import { buildMarketHealthSnapshot } from "../src/analysis";
import { parseReadCount } from "../src/limits";

const detail = {
  id: "market-1",
  question: "Will the example happen?",
  active: true,
  endDate: "2027-01-01T00:00:00Z",
  volume: 125_000,
  liquidity: 20_000,
};

describe("read-count validation", () => {
  it("accepts the documented range", () => {
    expect(parseReadCount("1")).toBe(1);
    expect(parseReadCount("100")).toBe(100);
  });

  it("rejects unbounded or ambiguous values", () => {
    for (const value of ["0", "101", "2.5", "-1", "nope"]) {
      expect(() => parseReadCount(value)).toThrow("expected an integer from 1 to 100");
    }
  });
});

describe("market-health snapshot", () => {
  it("derives top-of-book spread and nearby depth from unsorted levels", () => {
    const snapshot = buildMarketHealthSnapshot(
      detail,
      {
        marketId: "market-1",
        question: detail.question,
        outcomes: [
          {
            outcome: "Yes",
            tokenId: "yes-token",
            bids: [
              { price: "0.40", size: "10" },
              { price: "0.42", size: "5" },
            ],
            asks: [
              { price: "0.47", size: "3" },
              { price: "0.46", size: "2" },
            ],
            lastTradePrice: "0.43",
          },
        ],
      },
      { prices: [{ outcome: "Yes", tokenId: "yes-token", mid: "0.44" }] },
      { trades: [{ timestamp: "2026-08-07T12:00:00Z" }] },
      "2026-08-07T12:01:00Z",
    );

    expect(snapshot.capturedAt).toBe("2026-08-07T12:01:00Z");
    expect(snapshot.outcomes[0]).toMatchObject({
      bestBid: 0.42,
      bestAsk: 0.46,
      spread: 0.04,
      bidDepthWithinOneCentShares: 5,
      askDepthWithinOneCentShares: 5,
      midpoint: 0.44,
      lastTradePrice: 0.43,
    });
    expect(snapshot.recentTrades).toEqual({
      count: 1,
      latestAt: "2026-08-07T12:00:00Z",
    });
    expect(snapshot.warnings).toEqual([]);
  });

  it("surfaces incomplete and crossed books instead of inventing liquidity", () => {
    const snapshot = buildMarketHealthSnapshot(
      { ...detail, active: false },
      {
        outcomes: [
          {
            outcome: "Yes",
            tokenId: "yes-token",
            bids: [{ price: "0.60", size: "1" }],
            asks: [{ price: "0.55", size: "1" }],
          },
          { outcome: "No", tokenId: "no-token", bids: [], asks: [] },
        ],
      },
      { prices: [] },
      { trades: [] },
    );

    expect(snapshot.warnings).toContain("Market is not active.");
    expect(snapshot.warnings).toContain("Yes: best bid exceeds best ask.");
    expect(snapshot.warnings).toContain("No: top of book is incomplete.");
    expect(snapshot.outcomes[1]?.spread).toBeNull();
  });
});
