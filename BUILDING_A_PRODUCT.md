# Turn Prediction-Market Research into a Product

Raw market data is easy to demo and hard to charge for. A useful product helps a customer decide **what deserves attention**, explains the evidence and market quality behind an alert, preserves what was known at the time, and measures whether the workflow stays useful.

This guide is about product value and operating economics. It does not claim that prediction-market prices are true probabilities, that a forecast is profitable, or that trading an alert makes money.

## Start with the read-only job

The safest first product does not need order placement:

- “Show me active markets relevant to this topic.”
- “Tell me when midpoint/spread/liquidity changes cross a rule I chose.”
- “Give our research team a reproducible snapshot and source context.”
- “Compare our forecast with the market over time without letting the agent trade.”

That is why this repository keeps a strict read-only allowlist even though the upstream Suwappu SDK/API has prediction order methods.

## Product ladder

| Stage | Customer value | Capital moves? | What you add |
|---|---|---:|---|
| Screener | Search, market metadata, current prices/books | No | filters, saved searches, clear freshness |
| Watchlist + alerts | “Tell me when this market becomes interesting” | No | rules, dedupe, notifications, history |
| Research workspace/API | Team evidence, snapshots, exports, forecast ledger | No | tenants, collaboration, audit trail, webhooks/API |
| Execution handoff | Deliberate order review in a separate product boundary | Only after explicit approval | auth, policies, limits, order/fill lifecycle |

Validate paid retention in the first three stages before turning a research credential into a trading credential.

The clean activation event for this product is **saved rule -> first evidence-bearing watch evaluation**. A first paid-value event is stronger: **a deduplicated alert is delivered and the customer keeps the rule enabled or takes a research follow-up action**. Do not substitute API calls, signups, or page views for those product actions.

## The repository's `snapshot` is a useful primitive

One `snapshot --id ...` combines four Suwappu reads:

```text
market detail
+ outcome midpoint prices
+ order book
+ recent trades
-> normalized market-health snapshot
```

For each outcome it derives:

- best bid and ask;
- spread;
- share depth within one cent of the best bid/ask;
- midpoint and last-trade context when available;
- warnings for empty, incomplete, crossed, or cross-read-inconsistent books.

It also keeps volume, liquidity, end date, recent-trade count, and data capture time next to the derived fields.

This is deliberately **not** a signal saying “buy Yes.” A wide or thin book can tell a product that an alert needs context; it does not establish an investment edge.

## Treat the four reads as non-atomic

Prices and books can move between concurrent requests. Never imply that every field came from one exchange transaction or one indivisible timestamp.

For customer-facing history:

1. persist `capturedAt`;
2. keep the market ID and outcome token IDs;
3. store raw/normalized values used by the rule;
4. record the rule/version that produced an alert;
5. label missing/inconsistent data instead of filling it with a made-up number.

If a product needs tighter streaming/venue semantics, use Polymarket's official unified SDK directly and keep Suwappu for the surfaces that still add value.

## Build alerts around state changes, not polling noise

A useful alert should represent a customer-relevant transition, for example:

```text
midpoint crosses a configured level
AND spread <= customer's maximum spread
AND nearby depth >= customer's minimum depth
AND the same state was not already alerted
```

Store the last alert state. Add a cooldown/hysteresis rule so a value bouncing around one threshold does not send dozens of notifications.

The TypeScript v2 runtime implements that primitive directly:

```bash
bun src/cli.ts watch \
  --id <market-id> --outcome Yes --above 0.60 \
  --hysteresis 0.02 --max-spread 0.03 --min-depth 50
```

Its durable state answers “did this rule just transition?” across process restarts. Spread and two-sided near-book depth are **quality gates**, not alpha claims. If required evidence is missing, `watch` returns `insufficient_data` and preserves the prior rule state instead of converting a data outage into a new signal.

If you monitor many markets, do not call `snapshot` for every market every few seconds. Search/list first, narrow the watchlist, cache slow-changing metadata, and spend book/trade calls only on markets a customer actually follows.

## Measure product value before “strategy performance”

A research product can be useful whether or not the customer trades. Track:

- signup -> first saved search/watchlist;
- watchlist -> first useful snapshot/alert;
- alert open / follow-up action rate;
- duplicate/noisy alerts per active user;
- snapshot failure/incomplete-book rate;
- median data age and alert delivery latency;
- weekly retained watchlists and paying teams;
- exports/API/webhook usage;
- support interventions per 100 active watchlists.

Those are product and reliability metrics. They should not be replaced by cherry-picked profitable market outcomes.

## If you publish forecasts, keep a forecast ledger

The market midpoint is market data. Your model forecast is a separate claim.

Persist at least:

```text
forecast_id
market_id + outcome
forecast probability
market midpoint observed at forecast time
feature/data cutoff timestamp
model/rule version
resolution status + final outcome
```

Only score a forecast after the resolution is known. Brier score or log loss can measure probabilistic calibration/accuracy across enough forecasts; neither proves that a trading strategy made money. If you later trade, fees, spread, fill quality, position sizing, and realized/marked P&L belong in a separate execution ledger.

Avoid look-ahead and survivorship bias: a backfilled research report should only use information that was actually available when the forecast would have been emitted.

## Request economics are a product decision

The simple cost model is:

```text
browse/search ≈ 1 read
single raw market view ≈ 1 read
snapshot ≈ 4 Suwappu reads
watchlist cost ≈ watched markets × refreshes × reads per refresh
```

Use current Suwappu pricing/rate-limit documentation for actual cost. The important design point is multiplicative: a 4-read snapshot every 30 seconds for 100 markets is a very different product from a 5-market watchlist refreshed every five minutes.

Price from measured cost and retained value. Cache metadata, dedupe alerts, back off on failures, and let customers choose freshness tiers when that tradeoff is meaningful.

For a single paid plan, make the economics observable per active watchlist:

```text
watchlist contribution
  = allocated subscription/usage revenue
  - Suwappu read cost for that watchlist
  - notification + model + storage cost
  - allocated payment/support/refund cost
```

Then test capability fences instead of “better returns” fences:

| Free | Individual paid | Team / API |
|---|---|---|
| small saved watchlist, manual snapshots | more rules, durable alerts, retained history | shared rules, roles, webhooks/API, exports, audit retention |

Freshness can be a paid capability only when you can meet the operational promise and its request cost still leaves margin. Never sell “higher win rate” as the tier benefit.

## Separate builder economics from customer outcomes

Builder contribution margin:

```text
customer subscription / API / team revenue
- Suwappu usage
- database + queue + notification/model cost
- payment fees + support + credits/refunds
```

Customer forecasting/trading outcome, if your product even supports it:

```text
forecast calibration / accuracy
and, separately for executed positions,
realized + marked P&L - spread/fees/other execution costs
```

Do not call customer P&L your product revenue. Do not call a market midpoint your model's accuracy. Suwappu API metering is an input cost to your product, not automatic customer billing on your behalf.

## Choose the integration layer deliberately

Polymarket now maintains unified [TypeScript](https://github.com/Polymarket/ts-sdk) and [Python](https://github.com/Polymarket/py-sdk) SDKs. They are the right benchmark for direct venue integrations.

Use this Suwappu reference when you want:

- a narrow read-only tool surface that is easy to give an analyst/agent;
- a Suwappu-compatible data plane that can stay credential-free for public research;
- a copyable normalization layer for research products;
- hosted MCP as an alternate agent interface.

Use the direct Polymarket SDK when you need venue-native streaming, wallet/authentication lifecycle, direct order management, or another Polymarket-specific feature Suwappu does not expose.

Do not fork an entire venue SDK into this repository. Keeping the boundary small is what makes it understandable.

## Know what v2 ships—and what a paid team service still needs

The repository now ships a real single-node operating baseline: credential-free public research, bounded/retryable GETs, metadata-only request events, durable atomic watch state, an exclusive writer lock, hysteresis/cooldown dedupe, market-quality gates, a non-root container, dependency audit, and CodeQL.

That is enough to build and validate an individual/small-workflow product. It is **not** the same as multi-tenant enterprise infrastructure. Before charging teams for an enterprise service:

- move customer watchlists, snapshots, rule versions, and delivery state to durable tenant-scoped storage;
- add queue-backed notification delivery with its own idempotency key and retry/dead-letter policy;
- define data-freshness and delivery SLOs and expose stale/incomplete state to customers;
- add per-tenant request budgets, caching, quotas, and abuse controls;
- add authentication, roles/SSO as required, tenant isolation tests, audit retention, backup/restore drills, and an incident runbook;
- keep account/trading keys in secret management and out of research-only workers entirely;
- add capacity/HA design if you promise continuous monitoring across node or region failure;
- if execution is later added, create a separate approval, spend/exposure-limit, intent/reconciliation, and kill-switch boundary before the first live order.

Do not label the hosted product enterprise-ready until the claims you sell—retention, availability, support, security controls—are enforced and testable in that deployment.

## A good first paid experiment

1. Offer a free saved-search/snapshot workflow for a small watchlist.
2. Measure which users return and which snapshots actually lead to a useful follow-up.
3. Add paid deduplicated alerts, retained history, and exports/webhooks.
4. Add a team tier for shared watchlists, forecast ledgers, and audit history.
5. Consider an execution handoff only after customers repeatedly ask for it and the research product has earned trust.

The product is not “we can call a prediction API.” The product is a trustworthy attention and evidence loop that customers choose to keep using.
