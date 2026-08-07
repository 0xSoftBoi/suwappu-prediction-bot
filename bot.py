#!/usr/bin/env python3
"""Read-only Suwappu prediction-market explorer."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
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


def bounded_count(value: str) -> int:
    if not value.isdigit():
        raise argparse.ArgumentTypeError("expected an integer from 1 to 100")
    parsed = int(value)
    if parsed < 1 or parsed > 100:
        raise argparse.ArgumentTypeError("expected an integer from 1 to 100")
    return parsed


def as_mapping(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        value = value.model_dump()
    return value if isinstance(value, dict) else {}


def finite_number(value: Any, minimum: float = float("-inf"), maximum: float = float("inf")) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed != parsed or parsed in (float("inf"), float("-inf")):
        return None
    return parsed if minimum <= parsed <= maximum else None


def book_levels(value: Any) -> list[dict[str, float]]:
    if not isinstance(value, list):
        return []
    result: list[dict[str, float]] = []
    for raw in value:
        row = as_mapping(raw)
        price = finite_number(row.get("price"), 0, 1)
        size = finite_number(row.get("size"), 0)
        if price is not None and size is not None:
            result.append({"price": price, "size": size})
    return result


def near_depth(side: str, levels: list[dict[str, float]], best: float | None) -> float | None:
    if best is None:
        return None
    threshold = best - 0.01 if side == "bid" else best + 0.01
    total = sum(
        level["size"]
        for level in levels
        if (level["price"] >= threshold if side == "bid" else level["price"] <= threshold)
    )
    return round(total, 6)


def build_market_health_snapshot(
    detail_value: Any,
    book_value: Any,
    prices_value: Any,
    trades_value: Any,
    captured_at: str | None = None,
) -> dict[str, Any]:
    """Normalize four read-only responses into the same market-health datum as the TS CLI."""

    detail = as_mapping(detail_value)
    book = as_mapping(book_value)
    prices = as_mapping(prices_value)
    trades = as_mapping(trades_value)
    price_rows = [as_mapping(row) for row in prices.get("prices", []) if isinstance(row, dict)]
    outcome_books = [as_mapping(row) for row in book.get("outcomes", []) if isinstance(row, dict)]
    warnings: list[str] = []

    active = detail.get("active") if isinstance(detail.get("active"), bool) else None
    if active is False:
        warnings.append("Market is not active.")
    if not outcome_books:
        warnings.append("No outcome order books are currently available.")

    outcomes: list[dict[str, Any]] = []
    for outcome_book in outcome_books:
        outcome = outcome_book.get("outcome") if isinstance(outcome_book.get("outcome"), str) else "Unknown"
        token_id = outcome_book.get("tokenId") if isinstance(outcome_book.get("tokenId"), str) else ""
        bids = book_levels(outcome_book.get("bids"))
        asks = book_levels(outcome_book.get("asks"))
        best_bid = max((row["price"] for row in bids), default=None)
        best_ask = min((row["price"] for row in asks), default=None)
        price_row = next(
            (row for row in price_rows if token_id and row.get("tokenId") == token_id),
            None,
        ) or next((row for row in price_rows if row.get("outcome") == outcome), {})
        midpoint = finite_number(price_row.get("mid", outcome_book.get("midpoint")), 0, 1)

        if best_bid is None or best_ask is None:
            warnings.append(f"{outcome}: top of book is incomplete.")
        elif best_bid > best_ask:
            warnings.append(f"{outcome}: best bid exceeds best ask.")
        elif midpoint is not None and not best_bid <= midpoint <= best_ask:
            warnings.append(f"{outcome}: midpoint falls outside the fetched top-of-book spread.")

        outcomes.append(
            {
                "outcome": outcome,
                "tokenId": token_id,
                "midpoint": midpoint,
                "bestBid": best_bid,
                "bestAsk": best_ask,
                "spread": round(best_ask - best_bid, 6)
                if best_bid is not None and best_ask is not None
                else None,
                "bidDepthWithinOneCentShares": near_depth("bid", bids, best_bid),
                "askDepthWithinOneCentShares": near_depth("ask", asks, best_ask),
                "lastTradePrice": finite_number(outcome_book.get("lastTradePrice"), 0, 1),
            }
        )

    trade_rows = [as_mapping(row) for row in trades.get("trades", []) if isinstance(row, dict)]
    timestamps = sorted(
        row["timestamp"] for row in trade_rows if isinstance(row.get("timestamp"), str) and row["timestamp"]
    )
    end_date = detail.get("end_date") or detail.get("endDate")

    return {
        "capturedAt": captured_at
        or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "marketId": detail.get("id") or book.get("marketId") or prices.get("marketId") or "",
        "question": detail.get("question") or book.get("question") or prices.get("question") or "",
        "active": active,
        "endDate": end_date if isinstance(end_date, str) and end_date else None,
        "volume": finite_number(detail.get("volume"), 0),
        "liquidity": finite_number(detail.get("liquidity"), 0),
        "outcomes": outcomes,
        "recentTrades": {
            "count": len(trade_rows),
            "latestAt": timestamps[-1] if timestamps else None,
        },
        "warnings": warnings,
    }


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


async def cmd_snapshot(args: argparse.Namespace) -> None:
    async with create_client(api_key=require_env("SUWAPPU_API_KEY")) as client:
        detail, book, prices, trades = await asyncio.gather(
            client.predict.market(args.id),
            client.predict.book(args.id),
            client.predict.price(args.id),
            client.predict.trades(args.id, limit=args.trades),
        )
        dump(build_market_health_snapshot(detail, book, prices, trades))


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
    browse.add_argument("--top", type=bounded_count, default=10)
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
    trades.add_argument("--limit", type=bounded_count, default=20)

    snapshot = sub.add_parser("snapshot")
    snapshot.add_argument("--id", required=True)
    snapshot.add_argument("--trades", type=bounded_count, default=20)

    sub.add_parser("positions")

    orders = sub.add_parser("orders")
    orders.add_argument("--status")

    events = sub.add_parser("events")
    events.add_argument("--query")
    events.add_argument("--top", type=bounded_count, default=20)

    args = parser.parse_args()
    commands = {
        "browse": cmd_browse,
        "detail": cmd_detail,
        "book": cmd_book,
        "price": cmd_price,
        "trades": cmd_trades,
        "snapshot": cmd_snapshot,
        "positions": cmd_positions,
        "orders": cmd_orders,
        "events": cmd_events,
    }
    asyncio.run(commands[args.command](args))


if __name__ == "__main__":
    main()
