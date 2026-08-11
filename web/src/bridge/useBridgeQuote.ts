import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  formatEther,
  formatUnits,
  parseAbi,
  parseUnits,
  type Account,
  type Address,
  type Chain,
  type Transport,
  type WalletClient,
} from 'viem';
import { createViemClient, createViemSdk } from '@matterlabs/zksync-js/viem';

// Same on-chain facts as the CLI POC — see ADR-0002 D8.
import { L2_GAS_LIMIT, USDC_DECIMALS, USDC_L1, USDC_L2, XZK_L1 } from '../../../src/config';
import { l1PublicClient, l2PublicClient } from './clients';

const erc20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
]);

export interface Balances {
  ethL1: bigint;
  usdcL1: bigint;
  xzkL1: bigint;
  usdcAllowance: bigint;
  xzkAllowance: bigint;
  usdcL2: bigint;
}

export interface Quote {
  route: string;
  mintValue: bigint;
  l2GasLimit: bigint | undefined;
  l1GasMaxTotal: bigint;
  approvalsNeeded: number;
}

export interface PreflightCheck {
  label: string;
  ok: boolean;
  detail: string;
}

interface UseBridgeQuoteArgs {
  walletClient: WalletClient<Transport, Chain, Account> | null;
  address: Address | null;
}

/** Mirrors src/bridge.ts's quote → preflight logic (see ADR-0001), against the connected wallet. */
export function useBridgeQuote({ walletClient, address }: UseBridgeQuoteArgs) {
  const [amount, setAmount] = useState('');
  const [balances, setBalances] = useState<Balances | null>(null);
  const [balancesError, setBalancesError] = useState<string | null>(null);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const sdk = useMemo(() => {
    if (!walletClient) return null;
    const client = createViemClient({ l1: l1PublicClient, l2: l2PublicClient, l1Wallet: walletClient });
    return createViemSdk(client);
  }, [walletClient]);

  const refreshBalances = useCallback(async () => {
    if (!walletClient || !address) {
      setBalances(null);
      return;
    }
    setBalancesLoading(true);
    setBalancesError(null);
    try {
      const client = createViemClient({ l1: l1PublicClient, l2: l2PublicClient, l1Wallet: walletClient });
      const addrs = await client.ensureAddresses();
      const balanceOf = (token: Address) =>
        l1PublicClient.readContract({
          address: token,
          abi: erc20,
          functionName: 'balanceOf',
          args: [address],
        });
      const allowance = (token: Address, spender: Address) =>
        l1PublicClient.readContract({
          address: token,
          abi: erc20,
          functionName: 'allowance',
          args: [address, spender],
        });
      const [ethL1, usdcL1, xzkL1, usdcAllowance, xzkAllowance, usdcL2] = await Promise.all([
        l1PublicClient.getBalance({ address }),
        balanceOf(USDC_L1),
        balanceOf(XZK_L1),
        allowance(USDC_L1, addrs.l1AssetRouter),
        allowance(XZK_L1, addrs.l1AssetRouter),
        l2PublicClient.readContract({
          address: USDC_L2,
          abi: erc20,
          functionName: 'balanceOf',
          args: [address],
        }),
      ]);
      setBalances({ ethL1, usdcL1, xzkL1, usdcAllowance, xzkAllowance, usdcL2 });
    } catch (err) {
      setBalances(null);
      setBalancesError(err instanceof Error ? err.message : 'Failed to read balances');
    } finally {
      setBalancesLoading(false);
    }
  }, [walletClient, address]);

  useEffect(() => {
    refreshBalances();
  }, [refreshBalances]);

  // Debounced: quote() does live RPC + gas estimation, not worth firing on every keystroke.
  useEffect(() => {
    if (!sdk || !address) {
      setQuote(null);
      return;
    }
    let parsedAmount: bigint;
    try {
      parsedAmount = parseUnits(amount || '0', USDC_DECIMALS);
    } catch {
      setQuote(null);
      return;
    }
    if (parsedAmount <= 0n) {
      setQuote(null);
      return;
    }

    const timer = setTimeout(async () => {
      setQuoteLoading(true);
      setQuoteError(null);
      try {
        const q = await sdk.deposits.quote({
          token: USDC_L1,
          to: address,
          amount: parsedAmount,
          l2GasLimit: L2_GAS_LIMIT,
        });
        setQuote({
          route: q.route,
          mintValue: q.fees.mintValue ?? 0n,
          l2GasLimit: q.fees.l2?.gasLimit,
          l1GasMaxTotal: q.fees.l1?.maxTotal ?? 0n,
          approvalsNeeded: q.approvalsNeeded.length,
        });
      } catch (err) {
        setQuote(null);
        setQuoteError(err instanceof Error ? err.message : 'Failed to fetch quote');
      } finally {
        setQuoteLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [sdk, address, amount]);

  const preflight = useMemo<PreflightCheck[]>(() => {
    if (!balances || !quote) return [];
    let parsedAmount: bigint;
    try {
      parsedAmount = parseUnits(amount || '0', USDC_DECIMALS);
    } catch {
      parsedAmount = 0n;
    }
    return [
      {
        label: 'USDC balance ≥ amount',
        ok: balances.usdcL1 >= parsedAmount,
        detail: `${formatUnits(balances.usdcL1, USDC_DECIMALS)} / ${formatUnits(parsedAmount, USDC_DECIMALS)}`,
      },
      {
        label: 'mintValue is non-zero',
        ok: quote.mintValue > 0n,
        detail: `${formatEther(quote.mintValue)} XZK`,
      },
      {
        label: 'XZK balance ≥ mintValue',
        ok: quote.mintValue > 0n && balances.xzkL1 >= quote.mintValue,
        detail: `${formatEther(balances.xzkL1)} / ${formatEther(quote.mintValue)} XZK`,
      },
      {
        label: 'ETH for L1 gas > 0',
        ok: balances.ethL1 > 0n,
        detail: `${formatEther(balances.ethL1)} ETH`,
      },
    ];
  }, [balances, quote, amount]);

  const ready = preflight.length > 0 && preflight.every((c) => c.ok);

  return {
    amount,
    setAmount,
    balances,
    balancesLoading,
    balancesError,
    refreshBalances,
    quote,
    quoteLoading,
    quoteError,
    preflight,
    ready,
  };
}
