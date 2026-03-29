#!/usr/bin/env python3
"""Suwappu Prediction Bot — browse Polymarket prediction markets."""
import argparse, asyncio, json, os, sys
from suwappu import create_client

def require_env(n):
    v = os.environ.get(n)
    if not v: print(f"Error: {n} not set", file=sys.stderr); sys.exit(1)
    return v

async def cmd_browse(args):
    c = create_client(api_key=require_env("SUWAPPU_API_KEY"))
    markets = await c.predict.markets(query=args.query, limit=args.top)
    if args.json: print(json.dumps([m.model_dump() for m in markets], indent=2)); await c.close(); return
    print("Prediction Markets\n")
    for m in markets:
        yes = f"{m.outcome_prices[0]*100:.0f}" if m.outcome_prices else "?"
        vol = f"${m.volume/1e6:.1f}M" if m.volume > 1e6 else f"${m.volume/1e3:.0f}K"
        print(f"  {m.question}\n    YES: {yes}% | Vol: {vol} | Ends: {m.end_date[:10]}\n")
    await c.close()

async def cmd_detail(args):
    c = create_client(api_key=require_env("SUWAPPU_API_KEY"))
    d = await c.predict.market(args.id)
    if args.json: print(json.dumps(d.model_dump(), indent=2)); await c.close(); return
    print(f'\n"{d.question}"\n\n  {d.description[:300]}...')
    print(f"\n  Category: {d.category}\n  Resolved: {d.resolved_outcome or 'Not yet'}")
    await c.close()

def main():
    p = argparse.ArgumentParser(description="Suwappu Prediction Bot")
    sub = p.add_subparsers(dest="command", required=True)
    b = sub.add_parser("browse"); b.add_argument("--top", type=int, default=10); b.add_argument("--query"); b.add_argument("--json", action="store_true")
    d = sub.add_parser("detail"); d.add_argument("--id", required=True); d.add_argument("--json", action="store_true")
    args = p.parse_args()
    asyncio.run({"browse": cmd_browse, "detail": cmd_detail}[args.command](args))

if __name__ == "__main__": main()
