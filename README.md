# Suwappu Prediction Bot

A read-only prediction-market explorer for builders using [Suwappu](https://suwappu.bot).

The TypeScript and Python CLIs expose market discovery plus the newer order-book, price, trade, position, order-history, and event data surfaces. This repository intentionally does **not** expose order placement or cancellation, so running its commands cannot place a prediction-market trade.

## What you can explore

| Command | Data |
|---|---|
| `browse` | Search/list prediction markets |
| `detail --id …` | Full market metadata |
| `book --id …` | Current order book |
| `price --id …` | Current outcome prices |
| `trades --id …` | Recent market trades |
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

## Why no `order` command?

The current SDK source can place and cancel prediction-market orders. This example deliberately stops at read-only research so it is safe to hand to an exploratory agent without accidentally exposing a financial action.

If your product needs trading, implement a separate application-level approval boundary and server-side policy controls before adding those write methods.

## Hosted MCP alternative

Suwappu's hosted MCP server exposes prediction-market tools alongside swaps, perps, lending, wallet policies, and other agent capabilities:

```text
https://api.suwappu.bot/mcp
```

Use this focused repo when you want a narrow prediction-data allowlist; use MCP when you want a broader tool surface.

## Development

```bash
bun install --frozen-lockfile
bun run check
bun test

python -m pip install -r requirements.txt
python -m py_compile bot.py
```

CI runs the TypeScript typecheck/tests and validates the Python SDK import as blocking checks.

## Links

- [Suwappu docs](https://docs.suwappu.bot)
- [Prediction Markets guide](https://docs.suwappu.bot/guides/prediction-markets)
- [SDK source](https://github.com/0xSoftBoi/suwappubot/tree/main/packages/sdk)
- [Python SDK source](https://github.com/0xSoftBoi/suwappubot/tree/main/packages/sdk-python)

## License

MIT
