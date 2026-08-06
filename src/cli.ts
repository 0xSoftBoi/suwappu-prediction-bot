#!/usr/bin/env bun
import { Command } from "commander";
import { createClient } from "@suwappu/sdk";
import { predictionApi } from "./api.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Error: ${name} not set`);
    process.exit(1);
  }
  return value;
}

function client() {
  return createClient({ apiKey: requireEnv("SUWAPPU_API_KEY") });
}

async function printCurrent(request: () => Promise<unknown>): Promise<void> {
  requireEnv("SUWAPPU_API_KEY");
  try {
    console.log(JSON.stringify(await request(), null, 2));
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

const program = new Command()
  .name("suwappu-prediction-bot")
  .description("Read-only Polymarket data explorer powered by Suwappu")
  .version("1.0.0");

program
  .command("browse")
  .description("Browse prediction markets")
  .option("--top <n>", "number of markets", parseInt, 10)
  .option("--query <q>", "search by keyword")
  .option("--json", "JSON output")
  .action(async (opts) => {
    try {
      const markets = await client().predict.markets(opts.query, opts.top);
      if (opts.json) {
        console.log(JSON.stringify(markets, null, 2));
        return;
      }
      console.log("Prediction Markets\n");
      for (const market of markets) {
        const yes =
          market.outcomePrices.length > 0
            ? (market.outcomePrices[0] * 100).toFixed(0)
            : "?";
        const volume =
          market.volume > 1e6
            ? `$${(market.volume / 1e6).toFixed(1)}M`
            : `$${(market.volume / 1e3).toFixed(0)}K`;
        console.log(`  ${market.question}`);
        console.log(
          `    YES: ${yes}% | Vol: ${volume} | Ends: ${market.endDate.slice(0, 10)} | ${market.active ? "Active" : "Closed"}\n`,
        );
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  });

program
  .command("detail")
  .description("Get details for a specific market")
  .requiredOption("--id <id>", "market ID")
  .option("--json", "JSON output")
  .action(async (opts) => {
    try {
      const detail = await client().predict.market(opts.id);
      if (opts.json) {
        console.log(JSON.stringify(detail, null, 2));
        return;
      }
      console.log(`\n"${detail.question}"\n`);
      console.log(
        `  ${detail.description.slice(0, 300)}${detail.description.length > 300 ? "..." : ""}`,
      );
      console.log(`\n  Category:  ${detail.category}`);
      console.log(`  Created:   ${detail.createdAt}`);
      console.log(`  Ends:      ${detail.endDate}`);
      console.log(`  Resolved:  ${detail.resolvedOutcome ?? "Not yet"}`);
      console.log(
        `  Outcomes:  ${detail.outcomes
          .map((outcome, index) => {
            const price = detail.outcomePrices[index];
            return `${outcome} (${price === undefined ? "?" : (price * 100).toFixed(1) + "%"})`;
          })
          .join(" | ")}`,
      );
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  });

program
  .command("book")
  .description("Get the current order book for a market")
  .requiredOption("--id <id>", "market ID")
  .action((opts) => printCurrent(() => predictionApi.book(opts.id)));

program
  .command("price")
  .description("Get current outcome prices for a market")
  .requiredOption("--id <id>", "market ID")
  .action((opts) => printCurrent(() => predictionApi.price(opts.id)));

program
  .command("trades")
  .description("Get recent trades for a market")
  .requiredOption("--id <id>", "market ID")
  .option("--limit <n>", "number of trades", parseInt, 20)
  .action((opts) => printCurrent(() => predictionApi.trades(opts.id, opts.limit)));

program
  .command("positions")
  .description("List prediction positions for this Suwappu agent")
  .action(() => printCurrent(() => predictionApi.positions()));

program
  .command("orders")
  .description("List prediction orders for this Suwappu agent")
  .option("--status <status>", "optional order status filter")
  .action((opts) => printCurrent(() => predictionApi.orders(opts.status)));

program
  .command("events")
  .description("Browse/search prediction events")
  .option("--query <q>", "search text")
  .option("--top <n>", "number of events", parseInt, 20)
  .action((opts) => printCurrent(() => predictionApi.events(opts.query, opts.top)));

program.parseAsync();
