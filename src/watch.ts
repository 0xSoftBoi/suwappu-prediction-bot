import { createHash } from "node:crypto";
import type { MarketHealthSnapshot, OutcomeHealth } from "./analysis.js";
import type { WatchStateEntry } from "./state.js";

export interface WatchRule {
  marketId: string;
  outcome: string;
  direction: "above" | "below";
  threshold: number;
  hysteresis: number;
  maxSpread: number | null;
  minDepth: number | null;
  cooldownSeconds: number;
}

export interface WatchEvaluation {
  state: "triggered" | "reset" | "unchanged" | "suppressed" | "insufficient_data";
  shouldAlert: boolean;
  reason: string;
  observed: {
    midpoint: number | null;
    spread: number | null;
    bidDepthWithinOneCentShares: number | null;
    askDepthWithinOneCentShares: number | null;
  };
  nextEntry: WatchStateEntry | null;
}

function outcomeFor(snapshot: MarketHealthSnapshot, name: string): OutcomeHealth | null {
  const exact = snapshot.outcomes.find((row) => row.outcome === name);
  if (exact) return exact;
  const folded = name.toLocaleLowerCase();
  const matches = snapshot.outcomes.filter((row) => row.outcome.toLocaleLowerCase() === folded);
  return matches.length === 1 ? matches[0] : null;
}

export function watchKey(rule: WatchRule): string {
  const identity = JSON.stringify({
    marketId: rule.marketId,
    outcome: rule.outcome,
    direction: rule.direction,
    threshold: rule.threshold,
    hysteresis: rule.hysteresis,
    maxSpread: rule.maxSpread,
    minDepth: rule.minDepth,
  });
  return createHash("sha256").update(identity).digest("hex");
}

function cooldownElapsed(previous: WatchStateEntry | undefined, nowMs: number, seconds: number): boolean {
  if (!previous?.lastAlertAt || seconds === 0) return true;
  const last = Date.parse(previous.lastAlertAt);
  return !Number.isFinite(last) || nowMs - last >= seconds * 1_000;
}

export function evaluateWatch(
  snapshot: MarketHealthSnapshot,
  rule: WatchRule,
  previous: WatchStateEntry | undefined,
  now = new Date(),
): WatchEvaluation {
  const observedAt = now.toISOString();
  const outcome = outcomeFor(snapshot, rule.outcome);
  const observed = {
    midpoint: outcome?.midpoint ?? null,
    spread: outcome?.spread ?? null,
    bidDepthWithinOneCentShares: outcome?.bidDepthWithinOneCentShares ?? null,
    askDepthWithinOneCentShares: outcome?.askDepthWithinOneCentShares ?? null,
  };

  if (!outcome || outcome.midpoint === null) {
    return {
      state: "insufficient_data",
      shouldAlert: false,
      reason: "requested outcome or midpoint is unavailable",
      observed,
      nextEntry: null,
    };
  }
  if (snapshot.active !== true) {
    return {
      state: "insufficient_data",
      shouldAlert: false,
      reason: "market activity state is unavailable or inactive",
      observed,
      nextEntry: null,
    };
  }
  if (
    outcome.bestBid === null ||
    outcome.bestAsk === null ||
    outcome.bestBid > outcome.bestAsk ||
    outcome.midpoint < outcome.bestBid ||
    outcome.midpoint > outcome.bestAsk
  ) {
    return {
      state: "insufficient_data",
      shouldAlert: false,
      reason: "top-of-book evidence is incomplete or cross-read inconsistent",
      observed,
      nextEntry: null,
    };
  }
  if (rule.maxSpread !== null && (outcome.spread === null || outcome.spread > rule.maxSpread)) {
    return {
      state: "insufficient_data",
      shouldAlert: false,
      reason: "spread quality gate is not satisfied",
      observed,
      nextEntry: null,
    };
  }
  if (
    rule.minDepth !== null &&
    (outcome.bidDepthWithinOneCentShares === null ||
      outcome.askDepthWithinOneCentShares === null ||
      Math.min(outcome.bidDepthWithinOneCentShares, outcome.askDepthWithinOneCentShares) < rule.minDepth)
  ) {
    return {
      state: "insufficient_data",
      shouldAlert: false,
      reason: "near-book depth quality gate is not satisfied",
      observed,
      nextEntry: null,
    };
  }

  let triggered: boolean;
  if (rule.direction === "above") {
    triggered = previous?.triggered
      ? outcome.midpoint > rule.threshold - rule.hysteresis
      : outcome.midpoint >= rule.threshold;
  } else {
    triggered = previous?.triggered
      ? outcome.midpoint < rule.threshold + rule.hysteresis
      : outcome.midpoint <= rule.threshold;
  }

  const transition = triggered && !previous?.triggered;
  const mayAlert = transition && cooldownElapsed(previous, now.getTime(), rule.cooldownSeconds);
  const nextEntry: WatchStateEntry = {
    // Keep a cooldown-suppressed transition disarmed so a later poll can emit
    // once the cooldown expires while the condition is still true.
    triggered: transition && !mayAlert ? false : triggered,
    lastAlertAt: mayAlert ? observedAt : previous?.lastAlertAt ?? null,
    lastObservedAt: observedAt,
  };

  if (mayAlert) {
    return { state: "triggered", shouldAlert: true, reason: "rule transitioned into alert state", observed, nextEntry };
  }
  if (transition) {
    return { state: "suppressed", shouldAlert: false, reason: "rule transitioned but is inside cooldown", observed, nextEntry };
  }
  if (!triggered && previous?.triggered) {
    return { state: "reset", shouldAlert: false, reason: "rule crossed the hysteresis reset boundary", observed, nextEntry };
  }
  return { state: "unchanged", shouldAlert: false, reason: triggered ? "rule remains active" : "rule remains inactive", observed, nextEntry };
}
