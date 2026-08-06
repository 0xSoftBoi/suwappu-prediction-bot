#!/usr/bin/env python3
"""Read-only Suwappu prediction-market explorer."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from typing import Any

from suwappu import create_client


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        print(f"Error: {name} not set", file=sys.stderr)
        raise SystemExit(1)
    return value


def dump(value: Any) -> None:
    if hasattr(value, "model_dump"):
        value = value.model_dump()
    elif isinstance(value, list):
        value = [item.model_dump() if hasattr(item, "model_dump") else item for item in value]
    print(json.dumps(value, indent=2, default=str))


async def cmd_browse(args: argparse.Namespace) -> None:
    async with create_client(api_key=require_env("SUWAPPU_API_KEY")) as client:
        markets = await client.predict.markets(query=args.query, limit=args.top)
        if args.json:
            dump(markets)
            return

        print("Prediction Markets\n")
        for market in markets:
            yes = f"{market.outcome_prices[0] * 100:.0f}" if market.outcome_prices else "?"
            volume = (
                "$" + f"{market.volume / 1e6:.1f}M"
                if market.volume > 1e6
                else "$" + f"{market.volume / 1e3:.0f}K"
            )
            print(
                f"  {market.question}\n"
                f"    YES: {yes}% | Vol: {volume} | Ends: {market.end_date[:10]}\n"
            )


async def cmd_detail(args: argparse.Namespace) -> None:
    async with create_client(api_key=require_env("SUWAPPU_API_KEY")) as client:
        detail = await client.predict.market(args.id)
        if args.json:
            dump(detail)
            return
        suffix = "..." if len(detail.description) > 300 else ""
        print(f'\n"{detail.question}"\n\n  {detail.description[:300]}{suffix}')
        print(
            f"\n  Category: {detail.category}\n"
            f"  Resolved: {detail.resolved_outcome or 'Not yet'}"
        )


async def cmd_book(args: argparse.Namespace) -> None:
    async with create_client(api_key=require_env("SUWAPPU_API_KEY")) as client:
        dump(await client.predict.book(args.id))


async def cmd_price(args: argparse.Namespace) -> None:
    async with create_client(api_key=require_env("SUWAPPU_API_KEY")) as client:
        dump(await client.predict.price(args.id))


async def cmd_trades(args: argparse.Namespace) -> None:
    async with create_client(api_key=require_env("SUWAPPU_API_KEY")) as client:
        dump(await client.predict.trades(args.id, limit=args.limit))


async def cmd_positions(args: argparse.Namespace) -> None:
    async with create_client(api_key=require_env("SUWAPPU_API_KEY")) as client:
        dump(await client.predict.positions())


async def cmd_orders(args: argparse.Namespace) -> None:
    async with create_client(api_key=require_env("SUWAPPU_API_KEY")) as client:
        dump(await client.predict.orders(status=args.status))


async def cmd_events(args: argparse.Namespace) -> None:
    async with create_client(api_key=require_env("SUWAPPU_API_KEY")) as client:
        dump(await client.predict.events(query=args.query, limit=args.top))


def main() -> None:
    parser = argparse.ArgumentParser(description="Read-only Suwappu Prediction Bot")
    sub = parser.add_subparsers(dest="command", required=True)

    browse = sub.add_parser("browse")
    browse.add_argument("--top", type=int, default=10)
    browse.add_argument("--query")
    browse.add_argument("--json", action="store_true")

    detail = sub.add_parser("detail")
    detail.add_argument("--id", required=True)
    detail.add_argument("--json", action="store_true")

    book = sub.add_parser("book")
    book.add_argument("--id", required=True)

    price = sub.add_parser("price")
    price.add_argument("--id", required=True)

    trades = sub.add_parser("trades")
    trades.add_argument("--id", required=True)
    trades.add_argument("--limit", type=int, default=20)

    sub.add_parser("positions")

    orders = sub.add_parser("orders")
    orders.add_argument("--status")

    events = sub.add_parser("events")
    events.add_argument("--query")
    events.add_argument("--top", type=int, default=20)

    args = parser.parse_args()
    commands = {
        "browse": cmd_browse,
        "detail": cmd_detail,
        "book": cmd_book,
        "price": cmd_price,
        "trades": cmd_trades,
        "positions": cmd_positions,
        "orders": cmd_orders,
        "events": cmd_events,
    }
    asyncio.run(commands[args.command](args))


if __name__ == "__main__":
    main()
