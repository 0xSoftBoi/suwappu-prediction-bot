import { createClient } from "@suwappu/sdk";
const client = createClient({ apiKey: process.env.SUWAPPU_API_KEY });

console.log("Trending prediction markets:\n");
const markets = await client.predict.markets(undefined, 10);
for (const m of markets) {
  const yes = (m.outcomePrices[0] * 100).toFixed(0);
  const vol = m.volume > 1e6 ? `$${(m.volume/1e6).toFixed(1)}M` : `$${(m.volume/1e3).toFixed(0)}K`;
  console.log(`  ${m.question}\n    Yes: ${yes}% | Vol: ${vol} | Ends: ${m.endDate.slice(0,10)}\n`);
}
if (markets.length) {
  const t = markets[0];
  const d = await client.predict.market(t.id);
  console.log(`Deep dive: "${t.question}"\n  ${d.description.slice(0,200)}...\n  Category: ${d.category} | Resolved: ${d.resolvedOutcome ?? "Not yet"}`);
}
