import type { EIP1193Provider } from 'viem';

// MetaMask (and any other injected EIP-1193 wallet) attaches itself here.
declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

/** Throws with a user-facing message instead of a raw `undefined` access. */
export function getInjectedProvider(): EIP1193Provider {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No injected wallet found. Install MetaMask and reload the page.');
  }
  return window.ethereum;
}
