# Security Policy

This repository is a read-only standalone monitoring reference built on the
[Suwappu API](https://github.com/0xSoftBoi/suwappubot). Its CLI allowlist does
not expose prediction order placement or cancellation. Treat API keys and
configuration as sensitive even though this repository itself cannot submit a
prediction-market order.

## Reporting a vulnerability

**Do not open a public issue for security reports.** Instead:

- Use **GitHub Private Vulnerability Reporting** when it is enabled for this repository, or
- Email **security@suwappu.bot**.

Please include the affected file, version or commit, reproduction steps, and an
impact assessment.

**Scope note:** issues in this repository's own code, SDK usage, dependencies,
or CI belong here. Vulnerabilities in the Suwappu API, core bot, smart
contracts, custody/key-management layer, or shared SDK should be reported
upstream through the
[core security policy](https://github.com/0xSoftBoi/suwappubot/security/policy).

## Read-only authority boundary

The upstream Suwappu API and SDKs do expose prediction-market order placement
and cancellation. Those methods are deliberately omitted here. A change that
adds a money-moving method is a security-boundary change and must add explicit
application approval/policy controls rather than hiding execution behind a
research command.

`positions` and `orders` only inspect state already associated with the agent.
They may require Polymarket credentials that were initialized by a trading
workflow outside this repository; this explorer does not initialize them by
placing an order.

Public `browse`, `detail`, `book`, `price`, `trades`, `snapshot`, `events`, and
`watch` calls do not require an API key. `positions` and `orders` are
account-scoped reads and deliberately fail before network access when
`SUWAPPU_API_KEY` is absent.

The TypeScript network layer does not include response bodies in thrown API
errors and its optional telemetry contains only operation, outcome, attempt,
duration, and HTTP status. Do not add identifiers, queries, URLs, credentials,
provider bodies, or exception text to that telemetry contract.

## Disclosure handling

We will coordinate remediation and disclosure with reporters as capacity and
impact require. This repository does not promise a contractual response or fix
SLA, bounty, legal safe harbor, or production support entitlement. If you need
those terms for testing, contact the project before beginning research.
