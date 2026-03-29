#!/usr/bin/env bun
import { Command } from "commander";
import { createClient } from "@suwappu/sdk";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) { console.error(`Error: ${name} not set`); process.exit(1); }
  return val;
}

const program = new Command().name("suwappu-prediction-bot").description("Browse and analyze Polymarket prediction markets").version("1.0.0");

program.command("browse").description("Browse trending prediction markets")
  .option("--top <n>", "number of markets", parseInt, 10)
  .option("--query <q>", "search by keyword")
  .option("--json", "JSON output")
  .action(async (opts) => {
    const client = createClient({ apiKey: requireEnv("SUWAPPU_API_KEY") });
    try {
      const markets = await client.predict.markets(opts.query, opts.top);
      if (opts.json) { console.log(JSON.stringify(markets, null, 2)); return; }
      console.log("Prediction Markets\n");
      for (const m of markets) {
        const yes = (m.outcomePrices[0] * 100).toFixed(0);
        const vol = m.volume > 1e6 ? `$${(m.volume/1e6).toFixed(1)}M` : `$${(m.volume/1e3).toFixed(0)}K`;
        console.log(`  ${m.question}`);
        console.log(`    YES: ${yes}% | Vol: ${vol} | Ends: ${m.endDate.slice(0,10)} | ${m.active ? "Active" : "Closed"}\n`);
      }
    } catch (e: any) { console.error(`Error: ${e.message}`); process.exit(1); }
  });

program.command("detail").description("Get details for a specific market")
  .requiredOption("--id <id>", "market ID")
  .option("--json", "JSON output")
  .action(async (opts) => {
    const client = createClient({ apiKey: requireEnv("SUWAPPU_API_KEY") });
    try {
      const d = await client.predict.market(opts.id);
      if (opts.json) { console.log(JSON.stringify(d, null, 2)); return; }
      console.log(`\n"${d.question}"\n`);
      console.log(`  ${d.description.slice(0, 300)}${d.description.length > 300 ? "..." : ""}`);
      console.log(`\n  Category:  ${d.category}`);
      console.log(`  Created:   ${d.createdAt}`);
      console.log(`  Ends:      ${d.endDate}`);
      console.log(`  Resolved:  ${d.resolvedOutcome ?? "Not yet"}`);
      console.log(`  Outcomes:  ${d.outcomes.map((o, i) => `${o} (${(d.outcomePrices[i]*100).toFixed(1)}%)`).join(" | ")}`);
    } catch (e: any) { console.error(`Error: ${e.message}`); process.exit(1); }
  });

program.parseAsync();
