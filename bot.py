#!/usr/bin/env python3
"""Suwappu Prediction Bot — browse Polymarket markets."""
import asyncio, os
from suwappu import create_client

async def main():
    c = create_client(api_key=os.environ.get("SUWAPPU_API_KEY", ""))
    print("Trending prediction markets:\n")
    markets = await c.predict.markets(limit=10)
    for m in markets:
        yes = f"{m.outcome_prices[0]*100:.0f}" if m.outcome_prices else "?"
        vol = f"${m.volume/1e6:.1f}M" if m.volume > 1e6 else f"${m.volume/1e3:.0f}K"
        print(f"  {m.question}\n    Yes: {yes}% | Vol: {vol} | Ends: {m.end_date[:10]}\n")
    if markets:
        d = await c.predict.market(markets[0].id)
        print(f'Deep dive: "{markets[0].question}"\n  {d.description[:200]}...\n  Category: {d.category} | Resolved: {d.resolved_outcome or "Not yet"}')
    await c.close()

asyncio.run(main())
