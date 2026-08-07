# Suwappu Prediction Research Bot

A read-only prediction-market research reference for builders using [Suwappu](https://suwappu.bot).

The TypeScript and Python CLIs expose market discovery plus order-book, price, trade, position, order-history, and event data. They also build a normalized `snapshot` that turns four live reads into top-of-book spread/depth context you can reuse in a screener, watchlist, alert, or research product.

This repository intentionally does **not** expose order placement or cancellation, so its commands cannot place a prediction-market trade. That narrow authority is a feature: use it when an analyst or agent should be able to research a market without inheriting trading credentials.

## What you can explore

| Command | Data |
|---|---|
| `browse` | Search/list prediction markets |
| `detail --id …` | Full market metadata |
| `book --id …` | Current order book |
| `price --id …` | Current outcome prices |
| `trades --id …` | Recent market trades |
| `snapshot --id …` | Detail + midpoint + top-of-book spread/nearby depth + recent-trade freshness |
| `positions` | This agent's prediction positions |
| `orders` | This agent's existing prediction orders |
| `events` | Browse/search prediction events |

## TypeScript quick start

```bash
git clone https://github.com/0xSoftBoi/suwappu-prediction-bot.git
cd suwappu-prediction-bot
bun install --frozen-lockfile

export SUWAPPU_API_KEY=suwappu_sk_...

bun run src/cli.ts browse --query bitcoin --top 5
bun run src/cli.ts book --id <market-id>
bun run src/cli.ts price --id <market-id>
bun run src/cli.ts trades --id <market-id> --limit 20
bun run src/cli.ts snapshot --id <market-id> --trades 20
bun run src/cli.ts events --query crypto --top 10
```

## Python quick start

The current Suwappu Python SDK is source-only and is not yet published to PyPI. `requirements.txt` pins it to a specific `suwappubot` commit so the example is reproducible today.

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt

export SUWAPPU_API_KEY=suwappu_sk_...

python bot.py browse --query bitcoin --top 5
python bot.py book --id <market-id>
python bot.py trades --id <market-id> --limit 20
python bot.py snapshot --id <market-id> --trades 20
python bot.py positions
python bot.py orders --status open
```

## Get an API key

```bash
curl -X POST https://api.suwappu.bot/v1/agent/register \
  -H "Content-Type: application/json" \
  -d '{"name":"my-prediction-explorer"}'
```

Store the returned `suwappu_sk_...` key securely.

## SDK compatibility

The published TypeScript package is currently `@suwappu/sdk@0.4.x`. Its prediction namespace covers market listing/details, but the `suwappubot` monorepo has already added richer 0.6.x prediction helpers for books, prices, trades, positions, orders, events, order placement, and cancellation.

To keep this repository installable today:

- TypeScript uses the published SDK for `browse` and `detail`, then a tiny `src/api.ts` bridge for the newer **read-only** endpoints.
- Python pins the current source SDK, whose prediction namespace already exposes the richer read methods.

Once matching packages are published, the bridge can collapse into normal SDK calls.

The CLIs bound list/trade counts to `1..100`, use a 30-second HTTP timeout on the TypeScript bridge, and fail clearly on malformed successful responses rather than passing arbitrary upstream text into product logic.

## One useful product datum: `snapshot`

`snapshot` concurrently reads market detail, midpoint prices, the full outcome books, and recent trades, then normalizes them into one JSON document:

```json
{
  "marketId": "...",
  "question": "Will ...?",
  "active": true,
  "volume": 125000,
  "liquidity": 20000,
  "outcomes": [
    {
      "outcome": "Yes",
      "midpoint": 0.44,
      "bestBid": 0.42,
      "bestAsk": 0.46,
      "spread": 0.04,
      "bidDepthWithinOneCentShares": 5,
      "askDepthWithinOneCentShares": 5
    }
  ],
  "recentTrades": { "count": 20, "latestAt": "..." },
  "warnings": []
}
```

This is a **market-health snapshot**, not a forecast or an executable quote. The four reads are not atomic: the venue can move between requests. The helper surfaces obvious empty/crossed/inconsistent-book conditions rather than inventing missing liquidity.

Use it as an input to watchlists, alerts, research briefs, or your own forecasting model. If you publish a probability forecast, store the forecast separately from the market midpoint and score it only after the outcome resolves.

## Why no `order` command?

The current SDK source can place and cancel prediction-market orders. This example deliberately stops at read-only research so it is safe to hand to an exploratory agent without accidentally exposing a financial action.

If your product needs trading, implement a separate application-level approval boundary and server-side policy controls before adding those write methods.

`positions` and `orders` are also read-only. A fresh research-only agent can still receive an upstream “no Polymarket credentials” response because those account views depend on trading credentials initialized by a workflow outside this repository. The explorer does not place an order just to make those reads work.

## How this stacks up against direct Polymarket SDKs

Polymarket has moved new integrations to its unified [TypeScript SDK](https://github.com/Polymarket/ts-sdk) and [Python SDK](https://github.com/Polymarket/py-sdk). Those official SDKs are the better choice when your product needs direct Polymarket authentication, full account/trading workflows, streaming, or venue-specific features.

This repository should stay smaller:

| Need | Use this Suwappu reference | Use Polymarket's unified SDK |
|---|---:|---:|
| Narrow read-only allowlist for an analyst/agent | Yes | Build your own boundary |
| One API identity alongside swaps/perps/lending/MCP | Yes | No |
| Copyable market-health normalization | Yes | Build product logic on SDK data |
| Direct venue auth/order lifecycle/streaming | No | Yes |
| Claim a profitable prediction strategy | No | No SDK can establish that for you |

The differentiation is the authority/product boundary, not reimplementing a CLOB client.

## Hosted MCP alternative

Suwappu's hosted MCP server exposes prediction-market tools alongside swaps, perps, lending, wallet policies, and other agent capabilities:

```text
https://api.suwappu.bot/mcp
```

Use this focused repo when you want a narrow prediction-data allowlist; use MCP when you want a broader tool surface.

## Turn the research loop into a product

Read [BUILDING_A_PRODUCT.md](BUILDING_A_PRODUCT.md) for a concrete product ladder—free screener -> paid watchlists/alerts -> research workspace/API—and for activation, retention, request-cost, calibration, and builder-margin metrics. It keeps your business economics separate from whether any customer prediction turns out to be right.

## Development

```bash
bun install --frozen-lockfile
bun run check
bun test

python -m pip install -r requirements.txt
python -m py_compile bot.py
python -m unittest discover -s tests -p 'test_*.py'
```

CI runs the TypeScript typecheck/source tests, the Python read-side regressions, and the pinned Python SDK import as blocking checks.

## Links

- [Suwappu docs](https://docs.suwappu.bot)
- [Prediction Markets guide](https://docs.suwappu.bot/guides/prediction-markets)
- [SDK source](https://github.com/0xSoftBoi/suwappubot/tree/main/packages/sdk)
- [Python SDK source](https://github.com/0xSoftBoi/suwappubot/tree/main/packages/sdk-python)
- [Build a prediction-research product](BUILDING_A_PRODUCT.md)

## License

MIT
