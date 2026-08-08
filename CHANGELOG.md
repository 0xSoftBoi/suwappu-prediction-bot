# Changelog

## Unreleased

- Add a blocking Python dependency vulnerability audit alongside the existing Bun audit and dual-language CodeQL release gates.
- Document the same dependency gate for local contributors and production release checks.

## 2.0.0 — 2026-08-07

- Make public prediction research credential-free and keep account reads explicitly authenticated.
- Add durable `watch` rules with hysteresis, cooldown, spread/depth quality gates, and restart-safe dedupe.
- Add private atomic state, exclusive writer ownership, configurable bounded read retries/timeouts, and metadata-only API telemetry.
- Make the TypeScript REST read surface the canonical standalone runtime while retaining the Python SDK companion.
- Add standalone build, non-root container, dependency audit, dual-language CodeQL, operations runbook, and enterprise graduation boundary.

## 1.1.0

- Add normalized market-health snapshots and the initial builder product guide.
