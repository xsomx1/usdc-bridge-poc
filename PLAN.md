# Plan — USDC bridge Sepolia → Xsolla ZK Testnet

Living document. Updated 2026-08-11.
Decisions: [docs/ADR-0001-usdc-bridge.md](docs/ADR-0001-usdc-bridge.md) (CLI POC),
[docs/ADR-0002-bridge-frontend.md](docs/ADR-0002-bridge-frontend.md) (frontend)

## Status

| Epic | State |
|---|---|
| E1 Environment | ✅ |
| E2 Bridge script | ✅ calldata structurally identical to the reference tx |
| E3 Live bridge | ✅ 5 USDC delivered on L2 |
| E4 Documentation | ✅ ADR + README + this plan |
| E5 Frontend scaffold | ✅ Vite + React 19 + TS, `XUIProvider` dark/b2b, page shell, gate green |
| E6 MetaMask connect | ✅ connect, Sepolia guard, `accountsChanged`/`chainChanged` |
| E7 Bridge form | ✅ selects, amount, balances, `quote()`, preflight — verified live |
| E8 Send + tracking | ✅ 0.1 USDC bridged live, L2 delta = amount entered |
| E9 Frontend documentation | ✅ README frontend section, ADR-0002 finalized |

**Result — both front ends bridged live on 2026-08-11**, wallet
`0x26e99F6e94B983e0adD40E296D4f5788e67C9F69`:

| Path | L1 tx | L2 tx | Amount | L2 USDC |
|---|---|---|---|---|
| CLI (E3) | [`0xa3e7742d…`](https://sepolia.etherscan.io/tx/0xa3e7742d7644fa6382f8d75339269c5c5d2f68c2011f8bd847efcfda5cc50c82) | [`0x1d828333…`](https://zksync-os-testnet-xsolla.explorer.zksync.dev/tx/0x1d828333a64fbf969c32c8b1704fc49d31e99143774f5c29d40c505819a24129) | 5 USDC | 0 → 5 |
| Browser UI (E8) | [`0xcde2c14c…`](https://sepolia.etherscan.io/tx/0xcde2c14c95a6856a73190617a3d7bad618c0d9f58c85f316578f2b72ea2579d6) | [`0xa5d89206…`](https://zksync-os-testnet-xsolla.explorer.zksync.dev/tx/0xa5d8920639f7229503aa4a2497a9a42af04c35986c057475c5de003dec81f16b) | 0.1 USDC | 5 → 5.1 |

Both reached phase `L2_EXECUTED` and consumed L2 `gasUsed` 431,200 — identical, which is the
measurement ADR-0001 D3 rests on (the `bridgeMint` cost does not depend on the amount, so the
pinned `l2GasLimit` of 3,000,000 holds for both).

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

## E5 — Frontend scaffold ✅

Branch `feat/usdc-bridge-frontend`, off `feat/usdc-bridge-sepolia-to-xsolla-zk` (`756f764`).

- [x] T5.0 Branch + `docs/ADR-0002-bridge-frontend.md` with all confirmed decisions
- [x] T5.1 Vite + React 19 + TS + styled-components@6 added to root `package.json`;
      `dev` / `build` / `preview` scripts alongside `bridge:dry` / `bridge:send`; frontend code in
      `web/`
- [x] T5.2 `XUIProvider` (dark, b2b) + page shell on `FieldGroup`; empty form placeholder, no logic
- [x] T5.3 `src/config.ts` imported directly into `web/src/App.tsx`; `process.env` shimmed to `{}`
      via `vite.config.ts` `define` (browser has no `process`; config.ts's own `??` fallbacks
      apply) — `src/config.ts` itself untouched
- [x] T5.4 `@xsolla/xui-select`'s real API checked against the shipped `.d.ts` — confirmed
      adequate for the two network selectors (ADR-0002 D9), no alternative needed

**Gate:** `bun run build` green (`tsc --noEmit && vite build`); `bun run dev` serves the page;
verified in-browser — dark theme, `Pilat`/`Aktiv Grotesk` fonts loaded from `cdn.xsolla.net`.

Gotcha found and fixed: `Typography`'s `color` prop defaults to CSS `inherit`, not a theme
foreground — without an explicit `color` (e.g. `"primary"`) text renders black-on-black in dark
mode. See ADR-0002.

## E6 — MetaMask connect ✅

- [x] T6.1 `web/src/wallet/eip1193.ts` — `Window.ethereum` typing + `getInjectedProvider()`
- [x] T6.2 `web/src/wallet/useWallet.ts` — `connect()`, Sepolia network guard (`switchToL1`,
      falls back to `wallet_addEthereumChain` on error 4902), `accountsChanged`/`chainChanged`
      listeners, memoized viem `WalletClient` for E7/E8
- [x] T6.3 Wired into `App.tsx`: `Button` (connect), `Status` (connected/wrong-network),
      `InputCopy readOnly` (address), `Notification type="inline"` (wrong-network action, errors)

**Verified live** in a real Chrome window (Claude in Chrome) with the funded wallet
`0x26e99F6e94B983e0adD40E296D4f5788e67C9F69`:
- No-wallet error path (in the sandboxed preview, no extension) — inline error notification renders
- Real MetaMask connect — `Status` → "Connected", address shown correctly in `InputCopy`
- Network guard both directions — switched wallet to Ethereum Mainnet via `wallet_switchEthereumChain`
  → `chainChanged` fired → `Status` flipped to "Wrong network" + inline notification with a
  "Switch network" action appeared; clicking it called `switchToL1()` → back to "Connected", no
  MetaMask prompt needed since Sepolia was already an added chain
- `accountsChanged` on disconnect — revoked the site's permissions
  (`wallet_revokePermissions`) → UI reset to the initial "Connect MetaMask" state

Bug found and fixed during this live pass: the page rendered with **no background color** in a
real browser (white canvas, near-invisible light text) — `XUIProvider` only provides theme tokens,
it never paints a background itself. The sandboxed preview browser used while building E5/E6
masked this (it defaults to a black canvas). Fixed by applying
`useDesignSystem().theme.colors.background.primary` to the page wrapper. See ADR-0002 D11.

## E7 — Bridge form ✅

- [x] T7.1 `web/src/bridge/clients.ts` — L1/L2 viem `PublicClient`s, same public RPCs as the CLI
- [x] T7.2 `web/src/bridge/useBridgeQuote.ts` — balances (ETH/USDC/XZK L1, USDC L2), debounced
      `sdk.deposits.quote()`, same four preflight checks as `src/bridge.ts`'s dry run
- [x] T7.3 `useWallet.ts`'s `WalletClient` now carries an explicit `account` (ADR-0002 D12) — needed
      by `createViemClient`'s `WalletClient<Transport, Chain, Account>` type
- [x] T7.4 `App.tsx`: disabled `Select`×2 ("From" Sepolia / "To" Xsolla ZK Testnet — only route
      this POC supports), `Input` for amount, `Cell` rows for balances and quote, `Status` rows +
      `Notification` for preflight/readiness

**Verified live** in a real Chrome window with the funded wallet:
- Balances matched known on-chain state exactly (L1 10 USDC / ~100 XZK / 0.0487 ETH, L2 5 USDC —
  the amount from the E3 CLI bridge)
- `quote()` for 0.1 USDC returned `erc20-nonbase`, `mintValue` 0.000797479059 XZK, `l2GasLimit`
  3,000,000, 2 approvals — matches ADR-0001's live result shape
- Preflight: all 4 checks green at 0.1 USDC → "Ready to send"; entering 20 USDC (> 10 USDC balance)
  flipped the balance check red and the summary to "Not ready to send" — both directions confirmed

## E8 — Send + tracking ✅

- [x] T8.1 `web/src/bridge/useBridgeSend.ts` — manual step loop: `prepare()` once, then
      `writeContract(step.tx)` per step (ADR-0002 D7), waiting for each L1 receipt before the next
      step; the bridgehub step's tx hash is tracked separately for L2
- [x] T8.2 L2 tracking via polled `sdk.deposits.status({l1TxHash})` (4s interval, ADR-0002 D14),
      not the CLI's one-shot `wait()` — the UI needs the intermediate phase, not just the end state
- [x] T8.3 `App.tsx`: `Stepper` (vertical, `surface`) mapped from live step state, `InputCopy` +
      `Link` for L1/L2 tx hashes, `Result variant="modal"` for the final outcome with a "Start
      another bridge" reset

**Gate met — verified live** with the funded wallet, amount 0.1 USDC:
- All 3 steps (approve USDC → approve XZK → `bridgehub:two-bridges`) confirmed in MetaMask and
  tracked to "done" in the stepper in order
- L1 [`0xcde2c14c…`](https://sepolia.etherscan.io/tx/0xcde2c14c95a6856a73190617a3d7bad618c0d9f58c85f316578f2b72ea2579d6)
  (block 11,467,310, `gasUsed` 513,254) → L2
  [`0xa5d89206…`](https://zksync-os-testnet-xsolla.explorer.zksync.dev/tx/0xa5d8920639f7229503aa4a2497a9a42af04c35986c057475c5de003dec81f16b)
  (block 720,619, `gasUsed` 431,200), both `success`; shown in the UI with working explorer links
- `Result`: "Bridge complete", **L2 balance delta: 0.1 USDC** — the amount entered, not a constant
- Independently confirmed via a direct `eth_call` to `USDC_L2.balanceOf` from the browser:
  5.0 → 5.1 USDC, exactly +0.1

Gotchas found and documented (ADR-0002 D14–D15): `deposits.status({l1TxHash})` polling (not
`wait()`) for live phase updates; a type cast needed at the `writeContract(step.tx)` call site
because the SDK's `ViemPlanWriteRequest` widens `value` in a way viem's own overloads can't infer.

## E9 — Frontend documentation ✅

- [x] T9.1 [README.md](README.md) — "Frontend (browser UI)" section: how to run it, the flow, what's
      out of scope, and the live 0.1 USDC result
- [x] T9.2 [docs/ADR-0002-bridge-frontend.md](docs/ADR-0002-bridge-frontend.md) finalized — D1–D15
      cover every decision confirmed by the customer plus every gotcha found while building E5–E8
- [x] T9.3 This plan, kept current epic by epic throughout E5–E9

No other documents — CLAUDE.md rule 3 ("не заниматься бюрократией: документы только те, что
перечислены") applies to the frontend the same as it did to the CLI POC.

## Open follow-ups (not part of this POC)

- [ ] **Recover 5 USDC** from the failed attempt via `L1Nullifier.claimFailedDeposit`. Not exposed
      as an SDK method — needs a manual call with the L2→L1 log proof of L2 tx `0x088e6102…`.
- [ ] Upstream issue: `determineErc20L2Gas` underestimates `l2GasLimit` for `erc20-nonbase` on
      ZKsync OS chains (362,493 estimated vs 431,200 required).
- [ ] Upstream issue: `DepositQuote.mintValue` deprecation points at `fees.components?.mintValue`,
      which does not exist on `DepositFeeBreakdown`; the value is at `fees.mintValue`.

## Review gate

Reviewed and merged. E1–E9 are on `main` (`9c9d0c8`, pushed); `main` is the repository's default
branch. Both feature branches — `feat/usdc-bridge-sepolia-to-xsolla-zk` (E1–E4, `756f764`) and
`feat/usdc-bridge-frontend` (E5–E9, `984d92b`) — are ancestors of `main` and remain on `origin` for
history; their local copies were deleted after the merge.
