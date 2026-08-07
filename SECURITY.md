# Security Policy

This repository is a read-only satellite / example application built on the
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

## Our commitment

- **Acknowledge** reports within 3 business days.
- **Triage and severity** within 7 business days.
- **Coordinate disclosure** with the reporter and provide credit unless
  anonymity is requested.

## Safe harbor

Good-faith research conducted under this policy, without privacy violations,
data destruction, or service degradation, will not result in legal action from
us. If in doubt, contact us before testing.
