# Contributing

Thanks for improving the Suwappu Prediction Monitor.

## Local checks

```bash
bun install --frozen-lockfile
bun run typecheck
bun test
bun run build
bun audit --audit-level=high

python -m pip install -r requirements.txt
python -m pip install pip-audit
python -m unittest discover -s tests -p 'test_*.py'
pip-audit -r requirements.txt
```

Keep pull requests narrow and include regression tests for changed alert, state, network, or authority behavior. CI must keep both dependency audits, the container contract, and TypeScript/Python CodeQL green.

## Security boundary

Public research commands are intentionally credential-free and read-only. A contribution that adds order placement, cancellation, wallet signing, or any other money-moving capability is an authority-boundary change, not a normal CLI feature. It requires an explicit approval/policy/reconciliation design before implementation.

Do not commit API keys, venue credentials, production market state, customer watchlists, or real incident payloads. Use synthetic fixtures in tests.
