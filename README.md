# USDC bridge POC — Ethereum Sepolia → Xsolla ZK Testnet

Bridges USDC to Xsolla ZK Testnet (chain `579029`) via `@matterlabs/zksync-js`, and verifies the
generated calldata against a transaction that provably worked.

- Decisions and on-chain facts: [docs/ADR-0001-usdc-bridge.md](docs/ADR-0001-usdc-bridge.md)
- Progress: [PLAN.md](PLAN.md)

## Prerequisites

Three balances on **L1 Sepolia**:

| Asset | Address | Why |
|---|---|---|
| ETH | native | L1 gas (~0.004 ETH) |
| USDC | `0x1c7d4b196cb0c7b01d743fbc6116a902379c7238` | the amount being bridged |
| XZK | `0x50c379edd40D994A2a3faBd35401723a2110fdef` | `mintValue`, i.e. L1→L2 fees (~0.0001 XZK) |

XZK is the base token of chain 579029, so fees are charged in XZK, not ETH. **XZK held on L2 cannot
pay for a deposit** — it must be on L1.

## Setup

```bash
cp .env.example .env
```

For a dry run, `ACCOUNT=0x…` is enough — no private key is involved. To actually send, put a
`PRIVATE_KEY` in `.env` yourself. `.env` is gitignored.

## Run

Dry run — reads, quotes, builds the plan, diffs the calldata. Sends nothing:

```bash
bun run bridge:dry
```

Send — repeats the dry run, refuses to proceed unless every preflight check passes, then submits
two approvals and the bridge tx and waits for L2 execution:

```bash
bun run bridge:send
```

Optional env: `AMOUNT_USDC` (default `5`), `L2_GAS_LIMIT` (default `3000000`; `0` hands estimation
back to the SDK — see ADR D3, the SDK estimate is too low and reverts on L2), `L1_RPC_URL`,
`L2_RPC_URL`.

## Result

Bridged 5 USDC on 2026-08-11:
L1 [`0xa3e7742d…`](https://sepolia.etherscan.io/tx/0xa3e7742d7644fa6382f8d75339269c5c5d2f68c2011f8bd847efcfda5cc50c82)
→ L2 [`0x1d828333…`](https://zksync-os-testnet-xsolla.explorer.zksync.dev/tx/0x1d828333a64fbf969c32c8b1704fc49d31e99143774f5c29d40c505819a24129).
L2 gas consumed 431,200; `mintValue` 0.00079 XZK.

## What the dry run proves

The SDK picks the `erc20-nonbase` route and emits three steps: approve USDC, approve XZK for
`mintValue`, then `Bridgehub.requestL2TransactionTwoBridges` with `msg.value = 0`. The generated
calldata is decoded and compared field by field against reference tx
[`0x369d632f…`](https://sepolia.etherscan.io/tx/0x369d632f8a6789e1b5d79a20ef034d0befaa12100dc2262060abb85db0e11c43).

Last dry run: **structural fields match** (selector, Bridgehub, `msg.value`, `chainId`, `l2Value`,
`gasPerPubdata`, `secondBridgeAddress`, `secondBridgeValue`, 96-byte V1 second-bridge calldata,
token, amount). `l2GasLimit` and `mintValue` differ because the reference tx was the first bridge of
USDC and paid to deploy the L2 token; `refundRecipient` / `l2Receiver` differ because they are our
wallet.
