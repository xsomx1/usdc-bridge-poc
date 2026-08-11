# ADR-0002: Frontend for the USDC bridge POC

- **Status:** accepted
- **Date:** 2026-08-11
- **Context source:** decisions confirmed by the customer before E5 started; this ADR fixes them
  in writing and is appended to as later epics (E6–E9) surface new constraints.

## Context

E1–E4 (see [ADR-0001](ADR-0001-usdc-bridge.md)) produced a working CLI POC (`src/bridge.ts`) that
bridges USDC from Ethereum Sepolia to Xsolla ZK Testnet. E5 adds a browser UI on top of the same
on-chain logic and facts (`src/config.ts`) — MetaMask instead of a `.env` private key, buttons
instead of CLI flags. Scope for E5 itself is the frontend *scaffold* only: tooling, theme
provider, page shell. No wallet, no form, no bridging logic yet (that's E6–E8).

## Decisions

### D1. Stack: Vite + React 19 + TypeScript, bun, same `package.json`

No monorepo. Frontend code lives in `web/`, but dependencies and scripts live in the existing root
`package.json` alongside `bridge:dry` / `bridge:send`. Kept simple because this is a POC with one
frontend entry point, not a multi-package product.

### D2. UI toolkit: `@xsolla/xui-*` v0.202.3 only, no custom design system

Available on public npm — no private registry needed. Theme via
`XUIProvider initialMode="dark" initialProductContext="b2b"`.

Rejected: hand-rolled components, other UI libraries. The point of using the internal toolkit is
to look and behave like other Xsolla B2B tools with zero design work.

### D3. No layout primitives package — `FieldGroup` is the container

`@xsolla/xui-layout` is a meta-package of exactly `FieldGroup`, `List`, `Modal` — there is no
public `Box` / `Stack` / `Flex` / `Grid`. `@xsolla/xui-primitives-web` exists but is documented as
"not intended for direct consumer use" and is off-limits.

**All containers and layout use `FieldGroup`** (`@xsolla/xui-field-group`), which inherits
Box-like props (`gap`, `flexDirection`, `padding`, `maxWidth`) and renders real CSS. Custom CSS is
allowed **only** for the outermost page wrapper (viewport centering) — the toolkit has no
component for that job.

### D4. Wallet: bare EIP-1193 + viem `custom(window.ethereum)`, no wagmi/RainbowKit/react-query

Direct `window.ethereum` calls wrapped in viem's `custom` transport. Keeps the dependency surface
minimal for a POC with exactly one wallet (MetaMask) and one flow. (Wallet connection itself is
E6, not E5.)

### D5. RPC: public endpoints from `src/config.ts`, no proxy

CORS confirmed open (`Access-Control-Allow-Origin: *`) on both L1 and L2 RPCs used by the CLI POC.
The frontend calls them directly from the browser.

### D6. Scope: deposit L1→L2 only

Withdrawal back to L1, and recovery of the 5 USDC stuck from the CLI POC's failed first attempt
(see ADR-0001 Consequences), are both out of scope for this frontend.

### D7. Sending: manual step-by-step loop, not `create()` in one call

Each bridge step (`approve` USDC → `approve` XZK → `bridgehub:two-bridges`) is driven by
`prepare()` + `writeContract` individually, not the SDK's single-call `create()`. Needed so the UI
can show live progress per on-chain confirmation (stepper in E8). (Sending itself is E8, not E5.)

### D8. `src/config.ts` is imported directly, not duplicated

Chain id, USDC/XZK addresses, RPC URLs, `L2_GAS_LIMIT`, explorer URLs — all sourced from the
existing CLI POC's config module. No second source of truth for on-chain facts.

## Toolkit gotchas found while wiring the scaffold

- `Button` uses `onPress`; `Link` uses `onClick` (inconsistent across the toolkit, not a typo).
- `ProductContext` in v0.202.3 is only `b2b | b2c | corpsite`. `paystation` / `presentation`
  (seen in some docs) don't exist and silently break font resolution.
- `@xsolla/xui-core` has no `exports` map, only `main`/`module`/`types`. Vite resolves `module` →
  ESM fine. SSR breaks (`styled_components.default is not a function`) — irrelevant since this
  POC never runs SSR, but don't "fix" it by turning SSR on.
- `@xsolla/xui-link` imports `styled-components` without declaring it as a peer dependency.
  Harmless under bun/npm hoisting, where it's already installed for other packages.
- Fonts are injected client-side from `cdn.xsolla.net` — no CSS import needed, but the CDN must be
  reachable.
- Icons import only from the package root: `import { Wallet } from '@xsolla/xui-icons-base'`.
  Subpaths (e.g. `/user-interface`) are not published and will fail to resolve.
- `@xsolla/xui-icons-currency` has no crypto glyphs — no USDC/ETH logos from the toolkit.
- `styled-components@6` + React 19: verified, no peer warnings.

## UI component inventory (locked for E6–E8)

`XUIProvider` (`@xsolla/xui-core`) · `FieldGroup` (`@xsolla/xui-field-group`) · `Typography` ·
`Select` (`@xsolla/xui-select`) · `Input` (`@xsolla/xui-input`) · `Button` (`@xsolla/xui-button`) ·
`Status` (`@xsolla/xui-status`) · `Cell` + `Cell.Text` (`@xsolla/xui-cell`) · `Stepper`
(`@xsolla/xui-b2b-stepper`, vertical, `surface`, `caption`) · `Notification type="inline"` ·
`InputCopy readOnly` (not `disabled` — that removes the copy button) · `Link` · `Result
variant="modal"` (`@xsolla/xui-b2b-result`) · `Spinner` · `Divider` ·
`@xsolla/xui-icons-base`.

### D9. `@xsolla/xui-select` confirmed adequate for the two network selectors

Checked the shipped `.d.ts` (`node_modules/@xsolla/xui-select/web/index.d.ts`): `SelectProps` is
`options` (string[] or `{label, value, disabled}`) + `value` + `onChange` + `label` +
`placeholder`, with `searchable` opt-in (off by default) and no required ceremony beyond that.
Not overweight for a two-item list — using it as planned for "Откуда"/"Куда" in E7, no alternative
needed.

## Toolkit gotcha found while wiring the page shell

- `Typography`'s `color` prop defaults to CSS `inherit`, not a theme foreground token. Nothing in
  `XUIProvider`/dark mode sets a page-level text color, so any `Typography` without an explicit
  `color` (e.g. `color="primary"`) renders black-on-black in dark mode. Every `Typography` in the
  app needs an explicit `color`.

### D10. Wallet module: `web/src/wallet/eip1193.ts` + `useWallet.ts`

`eip1193.ts` augments `Window.ethereum: EIP1193Provider` (type from `viem`) and exposes
`getInjectedProvider()`, which throws a user-facing error instead of a raw `undefined` access when
no wallet is injected.

`useWallet.ts` is one hook: `connect()` (`eth_requestAccounts` + `eth_chainId`), `switchToL1()`
(`wallet_switchEthereumChain`, falling back to `wallet_addEthereumChain` on error code `4902`), and
a `useEffect` mirroring the wallet's own `accountsChanged` / `chainChanged` events into state (so
switching accounts or networks from MetaMask's own UI is reflected, not just switches initiated by
our buttons). `isWrongNetwork` is derived (`chainId !== l1Chain.id`, from `src/config.ts`). Exposes
a memoized viem `WalletClient` (`createWalletClient({chain: l1Chain, transport: custom(...)})`) for
E7/E8 to send transactions with, only once connected on the right chain.

## Consequences

- Frontend and CLI POC share one `package.json` and one source of on-chain truth
  (`src/config.ts`); no drift possible between the two.
- `src/config.ts` reads `process.env` for its dev overrides (RPC URLs, `AMOUNT_USDC`,
  `L2_GAS_LIMIT`). The browser has no `process`; `vite.config.ts` defines `process.env` as `{}` so
  the module's own `??` fallbacks apply. `src/config.ts` itself is untouched.
- The new `tsc --noEmit` build gate only type-checks `src/config.ts` (not all of `src/`) plus
  `web/src`. `src/bridge.ts` / `src/diag.ts` predate any tsconfig and have pre-existing strict-mode
  errors unrelated to the frontend; they run fine under `bun run` (which doesn't type-check) and
  are out of scope for E5 to fix.
