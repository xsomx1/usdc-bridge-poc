import { useCallback, useMemo, useState } from 'react';
import {
  parseUnits,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type Transport,
  type WalletClient,
} from 'viem';
import { createViemClient, createViemSdk } from '@matterlabs/zksync-js/viem';
import type { DepositPhase } from '@matterlabs/zksync-js/core';

// Same on-chain facts as the CLI POC — see ADR-0002 D8.
import { L2_GAS_LIMIT, USDC_DECIMALS, USDC_L1, USDC_L2 } from '../../../src/config';
import { l1PublicClient, l2PublicClient } from './clients';
import { erc20 } from './erc20';

export type StepStatus = 'pending' | 'sending' | 'confirming' | 'done' | 'error';

export interface SendStep {
  key: string;
  kind: string;
  description: string;
  status: StepStatus;
  txHash?: Hex;
}

export type SendPhase = 'idle' | 'preparing' | 'sending-steps' | 'waiting-l2' | 'done' | 'error';

interface UseBridgeSendArgs {
  walletClient: WalletClient<Transport, Chain, Account> | null;
  address: Address | null;
  onSettled?: () => void;
}

/**
 * The step-by-step send loop: prepare() once, then writeContract per step, so the
 * UI can show live progress per on-chain confirmation — see ADR-0002 D7. This is
 * the one place in the app that signs and sends; everything in useBridgeQuote is
 * read-only.
 */
export function useBridgeSend({ walletClient, address, onSettled }: UseBridgeSendArgs) {
  const [phase, setPhase] = useState<SendPhase>('idle');
  const [steps, setSteps] = useState<SendStep[]>([]);
  const [l2Phase, setL2Phase] = useState<DepositPhase | null>(null);
  const [l1TxHash, setL1TxHash] = useState<Hex | null>(null);
  const [l2TxHash, setL2TxHash] = useState<Hex | null>(null);
  const [delta, setDelta] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sdk = useMemo(() => {
    if (!walletClient) return null;
    const client = createViemClient({ l1: l1PublicClient, l2: l2PublicClient, l1Wallet: walletClient });
    return createViemSdk(client);
  }, [walletClient]);

  const reset = useCallback(() => {
    setPhase('idle');
    setSteps([]);
    setL2Phase(null);
    setL1TxHash(null);
    setL2TxHash(null);
    setDelta(null);
    setError(null);
  }, []);

  const send = useCallback(
    async (amount: string) => {
      if (!sdk || !walletClient || !address) return;
      setError(null);
      setPhase('preparing');
      try {
        const parsedAmount = parseUnits(amount, USDC_DECIMALS);
        const params = {
          token: USDC_L1,
          to: address,
          amount: parsedAmount,
          l2GasLimit: L2_GAS_LIMIT,
        } as const;

        const l2UsdcBefore = await l2PublicClient.readContract({
          address: USDC_L2,
          abi: erc20,
          functionName: 'balanceOf',
          args: [address],
        });

        const plan = await sdk.deposits.prepare(params);
        setSteps(
          plan.steps.map((s) => ({ key: s.key, kind: s.kind, description: s.description, status: 'pending' })),
        );
        setPhase('sending-steps');

        let bridgeTxHash: Hex | null = null;
        for (let i = 0; i < plan.steps.length; i++) {
          const step = plan.steps[i];
          setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: 'sending' } : s)));
          // step.tx is the SDK's ViemPlanWriteRequest — a relaxed WriteContractParameters
          // (`value` widened to `bigint | undefined` so one type covers payable and
          // non-payable steps). viem's own overloads can't resolve that union, hence the cast.
          const hash = await walletClient.writeContract(
            step.tx as Parameters<typeof walletClient.writeContract>[0],
          );
          setSteps((prev) =>
            prev.map((s, idx) => (idx === i ? { ...s, status: 'confirming', txHash: hash } : s)),
          );
          await l1PublicClient.waitForTransactionReceipt({ hash });
          setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: 'done' } : s)));
          if (step.kind === 'bridgehub:two-bridges') bridgeTxHash = hash;
        }
        if (!bridgeTxHash) throw new Error('No bridgehub step in the plan — nothing to track on L2');
        setL1TxHash(bridgeTxHash);

        setPhase('waiting-l2');
        let status = await sdk.deposits.status({ l1TxHash: bridgeTxHash });
        setL2Phase(status.phase);
        while (status.phase === 'L1_PENDING' || status.phase === 'L1_INCLUDED' || status.phase === 'L2_PENDING') {
          await new Promise((resolve) => setTimeout(resolve, 4000));
          status = await sdk.deposits.status({ l1TxHash: bridgeTxHash });
          setL2Phase(status.phase);
        }
        if (status.l2TxHash) setL2TxHash(status.l2TxHash);

        if (status.phase !== 'L2_EXECUTED') {
          throw new Error(`Deposit did not execute on L2 (phase: ${status.phase})`);
        }

        const l2UsdcAfter = await l2PublicClient.readContract({
          address: USDC_L2,
          abi: erc20,
          functionName: 'balanceOf',
          args: [address],
        });
        setDelta(l2UsdcAfter - l2UsdcBefore);
        setPhase('done');
      } catch (err) {
        setPhase('error');
        setError(err instanceof Error ? err.message : 'Failed to send');
      } finally {
        onSettled?.();
      }
    },
    [sdk, walletClient, address, onSettled],
  );

  return { phase, steps, l2Phase, l1TxHash, l2TxHash, delta, error, send, reset };
}
