import { describe, expect, it } from "bun:test";
import type { MarketHealthSnapshot } from "../src/analysis";
import { evaluateWatch, watchKey, type WatchRule } from "../src/watch";

function snapshot(midpoint: number, spread = 0.02, depth = 100): MarketHealthSnapshot {
  return {
    capturedAt: "2026-08-07T12:00:00.000Z",
    marketId: "market-1",
    question: "Will the example happen?",
    active: true,
    endDate: "2027-01-01T00:00:00Z",
    volume: 1_000,
    liquidity: 500,
    outcomes: [
      {
        outcome: "Yes",
        tokenId: "yes-token",
        midpoint,
        bestBid: midpoint - spread / 2,
        bestAsk: midpoint + spread / 2,
        spread,
        bidDepthWithinOneCentShares: depth,
        askDepthWithinOneCentShares: depth,
        lastTradePrice: midpoint,
      },
    ],
    recentTrades: { count: 1, latestAt: "2026-08-07T11:59:00.000Z" },
    warnings: [],
  };
}

const rule: WatchRule = {
  marketId: "market-1",
  outcome: "Yes",
  direction: "above",
  threshold: 0.6,
  hysteresis: 0.02,
  maxSpread: 0.03,
  minDepth: 50,
  cooldownSeconds: 3600,
};

describe("durable watch evaluation", () => {
  it("emits only on a transition and resets behind hysteresis", () => {
    const first = evaluateWatch(snapshot(0.61), rule, undefined, new Date("2026-08-07T12:00:00Z"));
    expect(first.state).toBe("triggered");
    expect(first.shouldAlert).toBe(true);

    const stillActive = evaluateWatch(
      snapshot(0.59),
      rule,
      first.nextEntry!,
      new Date("2026-08-07T12:05:00Z"),
    );
    expect(stillActive.state).toBe("unchanged");
    expect(stillActive.shouldAlert).toBe(false);

    const reset = evaluateWatch(
      snapshot(0.57),
      rule,
      stillActive.nextEntry!,
      new Date("2026-08-07T12:10:00Z"),
    );
    expect(reset.state).toBe("reset");
    expect(reset.nextEntry?.triggered).toBe(false);
  });

  it("preserves state when market-quality evidence is insufficient", () => {
    const previous = {
      triggered: true,
      lastAlertAt: "2026-08-07T12:00:00.000Z",
      lastObservedAt: "2026-08-07T12:00:00.000Z",
    };
    const result = evaluateWatch(snapshot(0.7, 0.08), rule, previous);
    expect(result.state).toBe("insufficient_data");
    expect(result.nextEntry).toBeNull();
  });

  it("suppresses a retrigger during cooldown, then permits it later", () => {
    const previous = {
      triggered: false,
      lastAlertAt: "2026-08-07T12:00:00.000Z",
      lastObservedAt: "2026-08-07T12:10:00.000Z",
    };
    const suppressed = evaluateWatch(
      snapshot(0.65),
      rule,
      previous,
      new Date("2026-08-07T12:30:00Z"),
    );
    expect(suppressed.state).toBe("suppressed");
    expect(suppressed.nextEntry?.triggered).toBe(false);

    const later = evaluateWatch(
      snapshot(0.65),
      rule,
      suppressed.nextEntry!,
      new Date("2026-08-07T13:01:00Z"),
    );
    expect(later.state).toBe("triggered");
    expect(later.shouldAlert).toBe(true);
  });

  it("uses a stable hash instead of user input as a state-file path", () => {
    expect(watchKey(rule)).toMatch(/^[a-f0-9]{64}$/);
    expect(watchKey(rule)).toBe(watchKey({ ...rule }));
  });
});
