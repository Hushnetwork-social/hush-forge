# FORGE Wallet Harness

Minimal WalletConnect-side test wallet core for FEAT-122.

The harness uses the same Neo private network defaults as the existing
Playwright NeoLine dAPI mock:

- RPC: `http://localhost:10332`
- chain id: `neo3:private`
- expected network magic: `5195086`
- account: `NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c`

This folder is intentionally outside `e2e/**` so its core behavior can run in
Vitest and CI without the headed browser/NeoLine profile. The next slice can
attach the live WalletKit session proposal/request transport to these modules.
