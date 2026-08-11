# ADR-0001: Bridging USDC from Ethereum Sepolia to Xsolla ZK Testnet

- **Status:** accepted (implementation blocked on funding, see Consequences)
- **Date:** 2026-08-11
- **Context source:** [Xsolla ZK Testnet — Resources & Quick Access](https://xsolla.atlassian.net/wiki/spaces/ZK/pages/24361533499), reference tx `0x369d632f8a6789e1b5d79a20ef034d0befaa12100dc2262060abb85db0e11c43`

## Context

We need a POC that moves USDC (`0x1c7d4b196cb0c7b01d743fbc6116a902379c7238`, 6 decimals) from
Ethereum Sepolia to Xsolla ZK Testnet (chain `579029`) using `@matterlabs/zksync-js`, with a
known-good transaction available as a correctness oracle.

Facts established by decoding the reference tx and reading contracts on-chain:

| Fact | Value |
|---|---|
| L1 Bridgehub | `0xc4fd2580c3487bba18d63f50301020132342fdbd` |
| L1 AssetRouter (`secondBridgeAddress`) | `0xB5d9C3F41E434b91295BD7962db5c873cEcCE2be` |
| L1 NativeTokenVault | `0xF8d4A5195737043f45F998539D5C62Eee02E3426` |
| **Base token of chain 579029** | `0x50c379edd40D994A2a3faBd35401723a2110fdef` — **XZK, not ETH** |
| USDC assetId | `0x1225…f48c` = `keccak(11155111, L2_NTV, USDC)` → L1-origin |
| USDC on L2 | `0xE31D4Ffe0896547a4cfCf7AcE5f25ffCBF2b9538` (already deployed) |
| Method | `Bridgehub.requestL2TransactionTwoBridges` (`0x24fd57fb`) |

## Decisions

### D1. Use `sdk.deposits` on the `erc20-nonbase` route. No SDK changes.

`pickDepositRoute` selects `erc20-nonbase` whenever the deposited token differs from the chain's
base token, regardless of whether the base token is ETH. The viem route implementation already
handles a non-ETH base token: it emits a **second approval** of the base token for `mintValue` and
sets `msg.value = 0`. That is exactly the shape of the reference tx.

Rejected: hand-rolling the `requestL2TransactionTwoBridges` call, or patching the SDK. Neither is
needed — verified by generating the calldata and diffing it against the reference tx.

### D2. Fees are paid in XZK on L1, and that is a hard prerequisite.

Because the base token is XZK, `mintValue` is denominated in XZK and pulled from L1 via allowance
to the AssetRouter. Holding XZK **on L2** does not help. A bridge therefore needs three balances
on L1: ETH (L1 gas), USDC (the amount), XZK (`mintValue`).

### D3. Pin `l2GasLimit` to 3,000,000. **Do not** use the SDK's estimate. (revised 2026-08-11)

Originally decided the opposite — trust the SDK's estimate (362,493) and treat the reference tx's
3,000,000 as first-bridge overhead for deploying the L2 token. **That was wrong, and it cost a
failed deposit.**

Measured:

| Attempt | `l2GasLimit` | L2 `gasUsed` | Result |
|---|---|---|---|
| Reference tx | 3,000,000 | 431,200 | success |
| Ours, SDK estimate | 362,493 | 362,493 | **reverted, out of gas** |
| Ours, pinned 3,000,000 | 3,000,000 | 431,200 | success |

The bridgeMint path costs 431,200 whether or not the L2 token already exists — the SDK's
`determineErc20L2Gas` underestimates it by ~16% on this chain. Unused L2 gas is refunded to
`refundRecipient`, so headroom costs only a larger up-front `mintValue` (~0.0008 XZK vs ~0.0001).
Cheap insurance against a stuck deposit.

`L2_GAS_LIMIT=0` hands estimation back to the SDK if that ever gets fixed upstream.

### D4. Correctness is verified by a calldata diff against the reference tx, not by unit tests.

This is a POC. `bun run bridge:dry` builds the real plan, decodes both our calldata and the
reference tx, and asserts the structural fields match. Cheaper than a test suite and a stronger
signal, since it compares against a transaction that provably worked.

Fields required to match: selector, Bridgehub address, `msg.value`, `chainId`, `l2Value`,
`gasPerPubdata`, `secondBridgeAddress`, `secondBridgeValue`, second-bridge calldata length (96
bytes = V1 encoding for L1-origin tokens), bridged token, amount.
Fields expected to differ: `l2GasLimit`, `mintValue`, `refundRecipient`, `l2Receiver`.

### D5. Tooling: bun + the published npm package, in a folder outside the SDK clone.

bun matches the SDK repo's own toolchain and runs TypeScript and `.env` with no extra packages.
The POC lives in `usdc-bridge-poc/` and depends on `@matterlabs/zksync-js@0.0.20` from npm, so the
`zksync-js` clone stays clean and the POC mirrors how a real integrator consumes the SDK.

### D6. The private key never enters the agent's flow.

A dry run needs no key: `ACCOUNT=0x…` is enough, since building and reading require no signature.
`PRIVATE_KEY` is only read for `bridge:send`, comes from `.env`, and `.env` is gitignored.

## Outcome

Bridge completed 2026-08-11 for wallet `0x26e99F6e94B983e0adD40E296D4f5788e67C9F69`.

| | Value |
|---|---|
| L1 tx | [`0xa3e7742d…`](https://sepolia.etherscan.io/tx/0xa3e7742d7644fa6382f8d75339269c5c5d2f68c2011f8bd847efcfda5cc50c82) (block 11466779) |
| L2 tx | [`0x1d828333…`](https://zksync-os-testnet-xsolla.explorer.zksync.dev/tx/0x1d828333a64fbf969c32c8b1704fc49d31e99143774f5c29d40c505819a24129) (block 720455) |
| Amount | 5 USDC → L2 balance 0 → 5 |
| `mintValue` paid | 0.00079 XZK |
| L1 gas | ~0.00064 ETH across 3 txs |
| Phase | `L2_EXECUTED` |

Failed first attempt (SDK gas estimate): L1
[`0x24a21d52…`](https://sepolia.etherscan.io/tx/0x24a21d52d89404ffc2318146fe4df6a8e0407f6c19ebecfffc8b818ae9548a03),
L2 `0x088e6102…` reverted.

## Consequences

- Zero new runtime dependencies beyond `@matterlabs/zksync-js` and `viem`.
- **5 USDC from the failed attempt is stuck on L1** and is not lost: it is recoverable via
  `L1Nullifier.claimFailedDeposit(...)`, which needs the L2→L1 log proof of the reverted tx. The ABI
  ships with the SDK (`IL1Nullifier`) but **no resource method exposes it** — recovery means a manual
  contract call. Tracked as a separate task, not part of this POC.
- Two upstream issues worth filing against `zksync-js`: the `l2GasLimit` underestimate for
  `erc20-nonbase` on ZKsync OS chains, and the `fees.components` docstring below.

## Notes on the SDK

`DepositQuote.mintValue` is marked deprecated in favour of `fees.components?.mintValue`, but
`DepositFeeBreakdown` has no `components` field — the value lives at `fees.mintValue`. Following the
docstring silently yields `undefined`. Worth an upstream issue; not blocking.
