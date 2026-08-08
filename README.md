# Suwappu Standalone Prediction Monitor

A read-only prediction-market monitoring product for builders using [Suwappu](https://suwappu.bot).

It can discover markets, inspect books/prices/trades, normalize a four-read market-health `snapshot`, and evaluate a durable `watch` rule with hysteresis, liquidity gates, cooldown, and restart-safe deduplication. The monitoring path needs **no API key** because Suwappu's market research routes are public reads.

This repository intentionally has no order or cancel command. `positions` and `orders` are account reads and require `SUWAPPU_API_KEY`; research and monitoring do not.

## What makes v2 a standalone product

| Property | v2 contract |
|---|---|
| Authority | Market research/watch is credential-free; no money-moving command exists |
| Failure behavior | Every REST read has a bounded timeout; safe GETs retry only transient failures |
| Alert correctness | Durable rule identity + hysteresis + cooldown prevents poll-noise duplicates |
| Market quality | Optional max-spread and minimum two-sided near-book depth gates |
| State | Private directory, `0600` state/lock, exclusive writer lock, atomic rename + file fsync |
| Observability | Optional metadata-only API events; never logs keys, market IDs, queries, URLs, or response bodies |
| Packaging | Reproducible Bun lock, compiled standalone build, non-root container |
| Supply chain | Blocking Bun + Python dependency audits + TypeScript/Python CodeQL in CI |

This is a strong **single-node monitoring reference**, not a claim of multi-tenant SaaS readiness. Team tenancy, managed databases, queues, RBAC/SSO, delivery integrations, retention policy, backups, SLOs, and HA remain application responsibilities; see [BUILDING_A_PRODUCT.md](BUILDING_A_PRODUCT.md).

## Five-minute start: research without credentials

```bash
git clone https://github.com/0xSoftBoi/suwappu-prediction-bot.git
cd suwappu-prediction-bot
bun install --frozen-lockfile

bun src/cli.ts browse --query bitcoin --top 5
bun src/cli.ts snapshot --id <market-id> --trades 20
```

The public read surface is:

| Command | Product datum | API key? |
|---|---|---:|
| `browse` | market discovery | No |
| `detail --id …` | market metadata | No |
| `book --id …` | outcome books | No |
| `price --id …` | outcome midpoints | No |
| `trades --id …` | recent trades | No |
| `snapshot --id …` | normalized market-health evidence | No |
| `events` | event discovery | No |
| `watch …` | durable threshold state + alert decision | No |
| `positions` / `orders` | this Suwappu agent's account state | **Yes** |

## Turn a snapshot into a durable alert

Run one evaluation on each scheduler tick:

```bash
bun src/cli.ts watch \
  --id <market-id> \
  --outcome Yes \
  --above 0.60 \
  --hysteresis 0.02 \
  --max-spread 0.03 \
  --min-depth 50 \
  --cooldown-seconds 3600
```

The command prints one JSON decision. `alert: true` occurs only when the midpoint crosses into the rule, required market-quality evidence is present, and cooldown permits delivery. A prior active rule does not reset until the midpoint crosses the hysteresis boundary. Missing/thin/wide market data yields `insufficient_data` and **does not erase prior state**.

Use the JSON as the input to your email, Slack, webhook, queue, or customer notification layer. Keep delivery idempotency in that layer too—the repository guarantees monitor-state dedupe, not exactly-once delivery across an external network.

State defaults to `.suwappu-prediction/watch-state.json`. Set `SUWAPPU_PREDICTION_STATE_DIR` to durable storage in production. Only one writer may own `watch.lock`; the application never guesses that an existing lock is stale.

## What a snapshot means

`snapshot` concurrently reads market detail, midpoint prices, outcome books, and recent trades. It derives:

- best bid/ask and spread;
- share depth within one cent of each best price;
- midpoint and last-trade context;
- capture time and recent-trade freshness;
- warnings for inactive, empty, incomplete, crossed, or cross-read-inconsistent books.

It is a **market-health snapshot, not a forecast and not an executable quote**. The four reads are not atomic. A market can move between them, a midpoint is not a fill price, and a market price is not proof that your own probability model is calibrated.

## Request policy

The v2 TypeScript product uses the explicit read-only Suwappu REST contract for all research commands. That gives the product one consistent network policy even while published SDK packages lag the monorepo source.

Defaults:

```text
SUWAPPU_REQUEST_TIMEOUT_MS=20000   # allowed: 250..30000
SUWAPPU_READ_RETRIES=2             # allowed: 0..4
SUWAPPU_API_EVENTS=0               # set 1 for metadata-only stderr events
```

Only safe `GET` reads retry, and only on transport failure, HTTP 408, 429, or 5xx. `Retry-After` is honored up to a five-second per-retry cap. Successful malformed JSON and contract-shape failures fail closed. Error messages intentionally omit upstream response bodies.

`SUWAPPU_API_URL` must be HTTPS except for localhost development and cannot contain credentials, a query, or a fragment. If an API key is supplied, surrounding whitespace is rejected.

## When an API key is actually needed

Only account-scoped reads in this repo require it:

```bash
export SUWAPPU_API_KEY=suwappu_sk_...
bun src/cli.ts positions
bun src/cli.ts orders --status open
```

A research-only deployment should simply omit the key. Do not mount a trading credential into a watch container “just in case.”

## Build and containerize it

```bash
bun run typecheck
bun test
bun run build
./dist/suwappu-predict --help

docker build -t suwappu-prediction-bot .
docker run --rm --network none suwappu-prediction-bot --help
```

For a scheduled container, persist `/data`:

```bash
docker run --rm \
  -v prediction-state:/data \
  suwappu-prediction-bot \
  watch --id <market-id> --outcome Yes --above 0.60 --max-spread 0.03
```

The image runs as the non-root `bun` user. See [docs/OPERATIONS.md](docs/OPERATIONS.md) before running the watch command unattended.

## Python companion

`bot.py` keeps a Python SDK example for builders who prefer Python. The current Suwappu Python SDK is source-only, so `requirements.txt` pins a known `suwappubot` commit. Its public research commands now also work without an API key; account reads still require one.

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python bot.py browse --query bitcoin --top 5
python bot.py snapshot --id <market-id>
```

The durable `watch` runtime and its stronger retry/telemetry policy are intentionally canonical in TypeScript rather than maintaining two production state machines.

## How this stacks up against current Polymarket OSS

Polymarket's current official [TypeScript SDK](https://github.com/Polymarket/ts-sdk) and [Python SDK](https://github.com/Polymarket/py-sdk) are the better choice for direct venue authentication, full trading workflows, or venue-specific features. Polymarket also exposes a [real-time market stream](https://docs.polymarket.com/market-data/realtime-data), which is a better fit than repeatedly polling this four-read snapshot when sub-poll latency matters.

| Need | This Suwappu product | Polymarket unified SDKs |
|---|---:|---:|
| Credential-free, narrow analyst/agent surface | Built in | Use the SDK's public client / build your boundary |
| One normalized market-health + durable alert primitive | Built in | Build product logic on venue data |
| One Suwappu plane beside swaps/perps/lending/MCP | Yes | No |
| Direct streaming + venue-native lifecycle | No | Yes |
| Trading/account authentication | Not this product | Yes |
| Proof of a profitable forecasting/trading edge | No | No SDK provides this |

The differentiation is the authority and product-state boundary, not a second implementation of Polymarket's CLOB SDK.

## Turn it into a business

Read [BUILDING_A_PRODUCT.md](BUILDING_A_PRODUCT.md) for the product ladder and economics: free screener -> paid durable alerts -> research workspace/API -> optional separately approved execution. The guide keeps customer forecast/trading outcomes separate from your builder contribution margin.

## Development

```bash
bun install --frozen-lockfile
bun run typecheck
bun test
bun run build
bun audit --audit-level=high

python -m pip install -r requirements.txt
python -m pip install pip-audit
python -m py_compile bot.py
python -m unittest discover -s tests -p 'test_*.py'
pip-audit -r requirements.txt
```

CI makes locked installs, tests, typecheck, standalone build/help, Python compatibility, a blocking high-severity Bun audit, a blocking Python known-vulnerability audit, non-root container build, and CodeQL blocking evidence for changes.

## Links

- [Suwappu Prediction Markets guide](https://docs.suwappu.bot/guides/prediction-markets)
- [Suwappu docs](https://docs.suwappu.bot)
- [Builder product guide](BUILDING_A_PRODUCT.md)
- [Operations runbook](docs/OPERATIONS.md)

## License

MIT
