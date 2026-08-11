import { useCallback, useEffect, useMemo, useState } from 'react';
import { createWalletClient, custom, type Address } from 'viem';

// Frontend re-uses the CLI POC's on-chain facts — see ADR-0002 D8.
import { l1Chain } from '../../../src/config';
import { getInjectedProvider } from './eip1193';

export type WalletStatus = 'disconnected' | 'connecting' | 'connected';

export interface WalletState {
  status: WalletStatus;
  address: Address | null;
  chainId: number | null;
  error: string | null;
}

const initialState: WalletState = {
  status: 'disconnected',
  address: null,
  chainId: null,
  error: null,
};

const l1ChainIdHex = `0x${l1Chain.id.toString(16)}`;

/**
 * Bare EIP-1193 + viem `custom(window.ethereum)` — no wagmi/RainbowKit/react-query
 * (see ADR-0002 D4). Covers: connect, the Sepolia network guard, and reacting to
 * `accountsChanged` / `chainChanged` fired by the wallet itself.
 */
export function useWallet() {
  const [state, setState] = useState<WalletState>(initialState);

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, status: 'connecting', error: null }));
    try {
      const provider = getInjectedProvider();
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      const chainIdHex = await provider.request({ method: 'eth_chainId' });
      setState({
        status: 'connected',
        address: accounts[0] ?? null,
        chainId: Number.parseInt(chainIdHex, 16),
        error: null,
      });
    } catch (err) {
      setState({
        ...initialState,
        error: err instanceof Error ? err.message : 'Failed to connect wallet',
      });
    }
  }, []);

  const switchToL1 = useCallback(async () => {
    const provider = getInjectedProvider();
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: l1ChainIdHex }],
      });
    } catch (err) {
      // 4902: the wallet doesn't know this chain yet — offer to add it.
      const code = (err as { code?: number } | null)?.code;
      if (code !== 4902) throw err;
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: l1ChainIdHex,
            chainName: l1Chain.name,
            nativeCurrency: l1Chain.nativeCurrency,
            rpcUrls: l1Chain.rpcUrls.default.http,
            blockExplorerUrls: l1Chain.blockExplorers
              ? [l1Chain.blockExplorers.default.url]
              : undefined,
          },
        ],
      });
    }
  }, []);

  // The wallet is the source of truth for account/network switches made outside
  // our UI (MetaMask's own menu) — mirror them into state.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return;
    const provider = window.ethereum;

    const handleAccountsChanged = (accounts: Address[]) => {
      setState((s) =>
        accounts.length === 0
          ? initialState
          : { ...s, status: 'connected', address: accounts[0], error: null },
      );
    };

    const handleChainChanged = (chainIdHex: string) => {
      setState((s) => ({ ...s, chainId: Number.parseInt(chainIdHex, 16) }));
    };

    provider.on('accountsChanged', handleAccountsChanged);
    provider.on('chainChanged', handleChainChanged);

    return () => {
      provider.removeListener('accountsChanged', handleAccountsChanged);
      provider.removeListener('chainChanged', handleChainChanged);
    };
  }, []);

  const walletClient = useMemo(() => {
    if (typeof window === 'undefined' || !window.ethereum || !state.address) {
      return null;
    }
    // `account` must be set explicitly (not left for the provider's default) — the
    // zksync-js viem adapter requires WalletClient<Transport, Chain, Account>, see ADR-0002 D12.
    return createWalletClient({
      account: state.address,
      chain: l1Chain,
      transport: custom(window.ethereum),
    });
  }, [state.address]);

  const isWrongNetwork = state.status === 'connected' && state.chainId !== l1Chain.id;

  return { ...state, isWrongNetwork, connect, switchToL1, walletClient };
}
