#!/usr/bin/env bun
import { Command, InvalidArgumentError } from "commander";
import { buildMarketHealthSnapshot } from "./analysis.js";
import { predictionApi } from "./api.js";
import { parseReadCount } from "./limits.js";
import { acquireStateLock, loadWatchState, saveWatchState } from "./state.js";
import { evaluateWatch, watchKey, type WatchRule } from "./watch.js";

function readCount(value: string): number {
  try {
    return parseReadCount(value);
  } catch (error) {
    throw new InvalidArgumentError(error instanceof Error ? error.message : String(error));
  }
}

function probability(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new InvalidArgumentError("expected a number from 0 to 1");
  }
  return parsed;
}

function nonNegative(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new InvalidArgumentError("expected a non-negative number");
  }
  return parsed;
}

function boundedSeconds(value: string): number {
  if (!/^\d+$/.test(value)) throw new InvalidArgumentError("expected an integer from 0 to 604800");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 604_800) {
    throw new InvalidArgumentError("expected an integer from 0 to 604800");
  }
  return parsed;
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

async function snapshotFor(marketId: string, tradesLimit: number) {
  const [detail, book, prices, trades] = await Promise.all([
    predictionApi.market(marketId),
    predictionApi.book(marketId),
    predictionApi.price(marketId),
    predictionApi.trades(marketId, tradesLimit),
  ]);
  return buildMarketHealthSnapshot(detail, book, prices, trades);
}

const program = new Command()
  .name("suwappu-prediction-bot")
  .description("Read-only prediction-market monitoring product powered by Suwappu")
  .version("2.0.0");

program
  .command("browse")
  .description("Browse prediction markets (public read; no API key required)")
  .option("--top <n>", "number of markets (1-100)", readCount, 10)
  .option("--query <q>", "search by keyword")
  .option("--json", "JSON output")
  .action(async (opts) => {
    const markets = await predictionApi.markets(opts.query, opts.top);
    if (opts.json) return printJson(markets);
    console.log("Prediction Markets\n");
    for (const market of markets) {
      const prices = Array.isArray(market.outcomePrices) ? market.outcomePrices : [];
      const yes = prices.length > 0 && Number.isFinite(prices[0]) ? `${(prices[0] * 100).toFixed(0)}%` : "?";
      const volume = Number.isFinite(market.volume)
        ? market.volume > 1e6
          ? `$${(market.volume / 1e6).toFixed(1)}M`
          : `$${(market.volume / 1e3).toFixed(0)}K`
        : "?";
      const ends = typeof market.endDate === "string" ? market.endDate.slice(0, 10) : "?";
      console.log(`  ${market.question || "(unnamed market)"}`);
      console.log(`    YES: ${yes} | Vol: ${volume} | Ends: ${ends} | ${market.active ? "Active" : "Closed"}\n`);
    }
  });

program
  .command("detail")
  .description("Get details for a specific market (public read)")
  .requiredOption("--id <id>", "market ID")
  .option("--json", "JSON output")
  .action(async (opts) => {
    const detail = await predictionApi.market(opts.id);
    if (opts.json) return printJson(detail);
    const description = typeof detail.description === "string" ? detail.description : "";
    console.log(`\n"${detail.question || "(unnamed market)"}"\n`);
    console.log(`  ${description.slice(0, 300)}${description.length > 300 ? "..." : ""}`);
    console.log(`\n  Category:  ${detail.category || "?"}`);
    console.log(`  Created:   ${detail.createdAt || "?"}`);
    console.log(`  Ends:      ${detail.endDate || "?"}`);
    console.log(`  Resolved:  ${detail.resolvedOutcome ?? "Not yet"}`);
  });

program
  .command("book")
  .description("Get the current order book for a market (public read)")
  .requiredOption("--id <id>", "market ID")
  .action(async (opts) => printJson(await predictionApi.book(opts.id)));

program
  .command("price")
  .description("Get current outcome midpoint prices for a market (public read)")
  .requiredOption("--id <id>", "market ID")
  .action(async (opts) => printJson(await predictionApi.price(opts.id)));

program
  .command("trades")
  .description("Get recent trades for a market (public read)")
  .requiredOption("--id <id>", "market ID")
  .option("--limit <n>", "number of trades (1-100)", readCount, 20)
  .action(async (opts) => printJson(await predictionApi.trades(opts.id, opts.limit)));

program
  .command("snapshot")
  .description("Build a non-atomic market-health snapshot from four public reads")
  .requiredOption("--id <id>", "market ID")
  .option("--trades <n>", "recent trades to inspect (1-100)", readCount, 20)
  .action(async (opts) => printJson(await snapshotFor(opts.id, opts.trades)));

program
  .command("watch")
  .description("Evaluate one durable, deduplicated threshold rule and persist its state")
  .requiredOption("--id <id>", "market ID")
  .requiredOption("--outcome <name>", "outcome label, for example Yes")
  .option("--above <probability>", "trigger when midpoint is at or above this value", probability)
  .option("--below <probability>", "trigger when midpoint is at or below this value", probability)
  .option("--hysteresis <probability>", "reset distance from the trigger threshold", probability, 0.01)
  .option("--max-spread <probability>", "require spread at or below this value", probability)
  .option("--min-depth <shares>", "require this many shares on both near-book sides", nonNegative)
  .option("--cooldown-seconds <n>", "minimum time between alerts for this rule", boundedSeconds, 3600)
  .option("--trades <n>", "recent trades to include in evidence (1-100)", readCount, 20)
  .action(async (opts) => {
    if ((opts.above === undefined) === (opts.below === undefined)) {
      throw new Error("watch requires exactly one of --above or --below");
    }
    const rule: WatchRule = {
      marketId: opts.id,
      outcome: opts.outcome,
      direction: opts.above === undefined ? "below" : "above",
      threshold: opts.above ?? opts.below,
      hysteresis: opts.hysteresis,
      maxSpread: opts.maxSpread ?? null,
      minDepth: opts.minDepth ?? null,
      cooldownSeconds: opts.cooldownSeconds,
    };

    const lock = acquireStateLock();
    try {
      const state = loadWatchState();
      const key = watchKey(rule);
      const snapshot = await snapshotFor(rule.marketId, opts.trades);
      const evaluation = evaluateWatch(snapshot, rule, state.watches[key]);
      if (evaluation.nextEntry) {
        state.watches[key] = evaluation.nextEntry;
        saveWatchState(state);
      }
      printJson({
        schemaVersion: 1,
        watchId: key,
        state: evaluation.state,
        alert: evaluation.shouldAlert,
        reason: evaluation.reason,
        capturedAt: snapshot.capturedAt,
        marketId: snapshot.marketId,
        outcome: rule.outcome,
        rule: {
          direction: rule.direction,
          threshold: rule.threshold,
          hysteresis: rule.hysteresis,
          maxSpread: rule.maxSpread,
          minDepth: rule.minDepth,
          cooldownSeconds: rule.cooldownSeconds,
        },
        observed: evaluation.observed,
        warnings: snapshot.warnings,
      });
    } finally {
      lock.release();
    }
  });

program
  .command("positions")
  .description("List account prediction positions (requires SUWAPPU_API_KEY)")
  .action(async () => printJson(await predictionApi.positions()));

program
  .command("orders")
  .description("List account prediction orders (requires SUWAPPU_API_KEY)")
  .option("--status <status>", "optional order status filter")
  .action(async (opts) => printJson(await predictionApi.orders(opts.status)));

program
  .command("events")
  .description("Browse/search prediction events (public read)")
  .option("--query <q>", "search text")
  .option("--top <n>", "number of events (1-100)", readCount, 20)
  .action(async (opts) => printJson(await predictionApi.events(opts.query, opts.top)));

program.parseAsync().catch((error: unknown) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
