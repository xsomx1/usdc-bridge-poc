# Plan — USDC bridge Sepolia → Xsolla ZK Testnet

Living document. Updated 2026-08-11.
Decisions: [docs/ADR-0001-usdc-bridge.md](docs/ADR-0001-usdc-bridge.md)

## Status — done ✅

| Epic | State |
|---|---|
| E1 Environment | ✅ |
| E2 Bridge script | ✅ calldata structurally identical to the reference tx |
| E3 Live bridge | ✅ 5 USDC delivered on L2 |
| E4 Documentation | ✅ ADR + README + this plan |

**Result:** L1 [`0xa3e7742d…`](https://sepolia.etherscan.io/tx/0xa3e7742d7644fa6382f8d75339269c5c5d2f68c2011f8bd847efcfda5cc50c82)
→ L2 [`0x1d828333…`](https://zksync-os-testnet-xsolla.explorer.zksync.dev/tx/0x1d828333a64fbf969c32c8b1704fc49d31e99143774f5c29d40c505819a24129),
phase `L2_EXECUTED`, L2 USDC balance 0 → 5.

## E1 — Environment ✅

- [x] T1.1 Branch `feat/usdc-bridge-sepolia-to-xsolla-zk`
- [x] T1.2 bun 1.3.14; `@matterlabs/zksync-js@0.0.20` + `viem@2.55.13`
- [x] T1.3 `.env` / `.env.example`; dry run needs only `ACCOUNT`, no key
- [x] T1.4 Smoke: balances and contract addresses read live

## E2 — Bridge script ✅

- [x] T2.1 `src/bridge.ts` — quote → prepare → diff → send
- [x] T2.2 Preflight refuses to send when short on USDC / XZK / ETH
- [x] T2.3 `quote()` — route `erc20-nonbase`, 2 approvals, `mintValue` in XZK
- [x] T2.4 Calldata diff vs reference tx — structural match
- [x] T2.5 `create()` — approve USDC, approve XZK, `requestL2TransactionTwoBridges`
- [x] T2.6 `wait({for:'l1'})` → `wait({for:'l2'})` → L2 balance delta

## E3 — Live bridge ✅

- [x] T3.1 Wallet funded with 100 XZK on L1
- [x] T3.2 Preflight all green
- [x] T3.3 Send — **failed on attempt 1** (SDK `l2GasLimit` estimate 362,493, out of gas);
      succeeded on attempt 2 with `l2GasLimit` pinned to 3,000,000
- [x] T3.4 Verified: L2 USDC delta = 5.0, L2 `gasUsed` 431,200

## E4 — Documentation ✅

- [x] T4.1 ADR-0001, with D3 revised after the failure
- [x] T4.2 README
- [x] T4.3 Result recorded here and in the ADR

## Open follow-ups (not part of this POC)

- [ ] **Recover 5 USDC** from the failed attempt via `L1Nullifier.claimFailedDeposit`. Not exposed
      as an SDK method — needs a manual call with the L2→L1 log proof of L2 tx `0x088e6102…`.
- [ ] Upstream issue: `determineErc20L2Gas` underestimates `l2GasLimit` for `erc20-nonbase` on
      ZKsync OS chains (362,493 estimated vs 431,200 required).
- [ ] Upstream issue: `DepositQuote.mintValue` deprecation points at `fees.components?.mintValue`,
      which does not exist on `DepositFeeBreakdown`; the value is at `fees.mintValue`.

## Review gate

Nothing has been committed in either repo. Both working trees are on
`feat/usdc-bridge-sepolia-to-xsolla-zk` awaiting review.
