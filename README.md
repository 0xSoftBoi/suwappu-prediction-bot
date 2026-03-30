# suwappu-prediction-bot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://python.org)

Browse and analyze Polymarket prediction markets using [Suwappu](https://suwappu.bot) DEX.

> **Warning**: Prediction markets involve real money. Understand the risks before trading.

## Install

```bash
bun install
```

## Usage

```bash
export SUWAPPU_API_KEY=suwappu_sk_...

# Browse trending markets
bun run src/cli.ts browse
bun run src/cli.ts browse --top 5 --json
bun run src/cli.ts browse --query "bitcoin"

# Get market details
bun run src/cli.ts detail --id <market-id>

# Python
python bot.py browse --top 5
python bot.py detail --id <market-id> --json
```

## Commands

| Command | Description |
|---------|-------------|
| `browse` | List trending prediction markets with YES/NO probabilities |
| `detail` | Deep dive into a specific market |

## Example Output

```
$ bun run src/cli.ts browse --top 3

Prediction Markets

  Will Bitcoin hit $100k by end of 2026?
    YES: 72% | Vol: $4.2M | Ends: 2026-12-31 | Active

  Will Ethereum flip Bitcoin in market cap?
    YES: 8% | Vol: $1.8M | Ends: 2027-06-30 | Active

  Will the Fed cut rates in Q2 2026?
    YES: 54% | Vol: $890K | Ends: 2026-06-30 | Active
```

```
$ bun run src/cli.ts detail --id 0xabc123

"Will Bitcoin hit $100k by end of 2026?"

  Bitcoin reaching six figures has been a long-standing milestone...

  Category:  crypto
  Created:   2025-01-15
  Ends:      2026-12-31
  Resolved:  Not yet
  Outcomes:  Yes (72.0%) | No (28.0%)
```

## Development

```bash
bun test && bun run check
```

## Links

- [Suwappu Docs](https://docs.suwappu.bot) | [Prediction Markets Guide](https://docs.suwappu.bot/guides/prediction-markets)

## License

MIT
