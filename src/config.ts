// Network + asset facts for the USDC → Xsolla ZK Testnet bridge POC.
// Everything here was verified on-chain; see docs/ADR-0001-usdc-bridge.md.

import { defineChain } from 'viem';
import { sepolia } from 'viem/chains';

export const L1_RPC = process.env.L1_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';
export const L2_RPC = process.env.L2_RPC_URL ?? 'https://zksync-os-testnet-xsolla.zksync.dev';

/** Xsolla ZK Testnet. Source: Confluence "Xsolla ZK Testnet — Resources & Quick Access". */
export const xsollaZkTestnet = defineChain({
  id: 579029,
  name: 'Xsolla ZK Testnet',
  nativeCurrency: { name: 'Xsolla ZK Gas Token', symbol: 'XZK', decimals: 18 },
  rpcUrls: { default: { http: [L2_RPC] } },
  blockExplorers: {
    default: {
      name: 'ZKsync OS Explorer',
      url: 'https://zksync-os-testnet-xsolla.explorer.zksync.dev',
    },
  },
  testnet: true,
});

export const l1Chain = sepolia;

/** USDC on Sepolia — the asset we bridge. 6 decimals. */
export const USDC_L1 = '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238' as const;
export const USDC_DECIMALS = 6;

/**
 * Base token of chain 579029 is XZK, NOT ETH. L1→L2 fees (`mintValue`) are
 * denominated in XZK and pulled from L1 via allowance, so `msg.value` is 0.
 */
export const XZK_L1 = '0x50c379edd40D994A2a3faBd35401723a2110fdef' as const;

/** USDC on L2, already deployed (so this is not a first-time bridge). */
export const USDC_L2 = '0xE31D4Ffe0896547a4cfCf7AcE5f25ffCBF2b9538' as const;

/** Known-good bridge tx used as the correctness oracle for our generated calldata. */
export const REFERENCE_TX =
  '0x369d632f8a6789e1b5d79a20ef034d0befaa12100dc2262060abb85db0e11c43' as const;

export const EXPLORER_L1 = 'https://sepolia.etherscan.io';
export const EXPLORER_L2 = 'https://zksync-os-testnet-xsolla.explorer.zksync.dev';

/** Amount to bridge, in whole USDC. Matches the reference tx by default. */
export const AMOUNT_USDC = process.env.AMOUNT_USDC ?? '5';

/**
 * l2GasLimit. Defaults to the value the reference tx proved works.
 *
 * Do not fall back to the SDK's own estimate here: it returned 362_493, the L2 tx
 * consumed all of it and reverted out of gas, and the reference tx needed 431_200.
 * Unused L2 gas is refunded to `refundRecipient`, so the headroom costs nothing but
 * a larger up-front `mintValue` (~0.0008 XZK instead of ~0.0001).
 *
 * Set L2_GAS_LIMIT=0 to hand estimation back to the SDK.
 */
const rawL2GasLimit = process.env.L2_GAS_LIMIT;
export const L2_GAS_LIMIT =
  rawL2GasLimit === '0' ? undefined : BigInt(rawL2GasLimit ?? '3000000');
