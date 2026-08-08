# Operations Runbook

The TypeScript `watch` command is a single-node, one-shot monitoring worker. Your scheduler decides **when** it runs; this repository decides **whether a market state transition is alert-worthy** and persists that decision across restarts.

## Production contract

- Run exactly one `watch` writer against a state directory at a time.
- Put `SUWAPPU_PREDICTION_STATE_DIR` on durable storage.
- Do not inject `SUWAPPU_API_KEY` unless the same deployment deliberately calls `positions` or `orders`.
- Treat stdout as the product decision stream; structured API telemetry, when enabled, is stderr.
- Parse `state` and `alert` from JSON. Exit `0` means the evaluation completed, not that an alert fired.
- Treat non-zero exit as an operational failure and retry at the scheduler layer only after considering the built-in read retries.

## State and locking

The state directory is forced to mode `0700`; `watch-state.json` and `watch.lock` are `0600`.

State writes use a unique temporary file in the same directory, file `fsync`, atomic rename, and best-effort directory `fsync`. Invalid/corrupt state fails closed rather than silently starting a new alert history.

`watch.lock` uses exclusive creation and an ownership token. The process releases only a lock whose token it still owns. There is intentionally no time-based stale-lock deletion because wall-clock age cannot prove that another worker is dead.

If a process crashes and leaves a lock:

1. prove that no other worker is using that exact state directory;
2. preserve/copy `watch-state.json` if incident analysis needs it;
3. remove only that state directory's `watch.lock`;
4. run one manual `watch` check and inspect the JSON before resuming the scheduler.

## Network failure semantics

All product network calls are `GET` reads. The default timeout is 20 seconds per attempt and the default retry count is two.

| Failure | Product behavior |
|---|---|
| transport error / timeout | retry within configured bound, then fail |
| HTTP 408 / 429 / 5xx | retry within bound; honor bounded `Retry-After` |
| HTTP 4xx other than 408/429 | fail without retry |
| successful response with invalid JSON/shape | fail closed without retry |
| missing midpoint/book quality evidence | successful `insufficient_data`; preserve prior alert state |
| inactive market | successful `insufficient_data`; preserve prior alert state |

No upstream response body is copied into a TypeScript error message. This reduces the chance of reflecting a secret or provider diagnostic into a log sink.

## Metadata-only telemetry

Set `SUWAPPU_API_EVENTS=1` to emit one JSON line per API attempt on stderr:

```json
{"event":"suwappu.api","operation":"predict.book","outcome":"ok","attempt":1,"durationMs":83,"status":200}
```

The event schema excludes the API key, URL, query, market ID, response body, and exception text. Alert JSON on stdout does contain the market ID/outcome because those are required product evidence; route those records according to your customer-data policy.

Useful operational measurements include read error rate, `insufficient_data` rate, API latency, alert rate, cooldown suppression rate, and scheduler lag. Product usefulness metrics belong separately in your analytics system.

## Container contract

The image runs as the non-root `bun` user and uses `/data/state` by default.

```bash
docker build -t suwappu-prediction-bot:2 .
docker run --rm --network none suwappu-prediction-bot:2 --help
```

For real watch runs, mount `/data` on a persistent volume. Do not run multiple replicas against a filesystem that does not provide reliable exclusive-create and atomic-rename semantics.

## Release gate

Before a release or merge to `main`, require:

```text
bun install --frozen-lockfile
bun run typecheck
bun test
bun run build
./dist/suwappu-predict --help
python compatibility tests
bun audit --audit-level=high
pip-audit -r requirements.txt
non-root container build + zero-network help smoke test
TypeScript + Python CodeQL
```

For a paid multi-tenant service, add managed tenant-scoped storage, queue-backed delivery, alert-delivery idempotency, RBAC/SSO, audit retention, backups/restore tests, SLOs/alerts, capacity budgets, and regional/HA design before calling the deployment enterprise-ready.
