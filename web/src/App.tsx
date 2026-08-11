import styled from 'styled-components';
import { useDesignSystem } from '@xsolla/xui-core';
import { Typography } from '@xsolla/xui-typography';
import { FieldGroup } from '@xsolla/xui-field-group';
import { Button } from '@xsolla/xui-button';
import { Status } from '@xsolla/xui-status';
import { Notification } from '@xsolla/xui-notification';
import { InputCopy } from '@xsolla/xui-input-copy';
import { Input } from '@xsolla/xui-input';
import { Select } from '@xsolla/xui-select';
import { Cell } from '@xsolla/xui-cell';
import { Divider } from '@xsolla/xui-divider';
import { Spinner } from '@xsolla/xui-spinner';
import { Stepper, type StepStateType } from '@xsolla/xui-b2b-stepper';
import { Result } from '@xsolla/xui-b2b-result';
import { Link } from '@xsolla/xui-link';
import { Wallet as WalletIcon } from '@xsolla/xui-icons-base';
import { formatEther, formatUnits } from 'viem';

import {
  EXPLORER_L1,
  EXPLORER_L2,
  USDC_DECIMALS,
  USDC_L1,
  USDC_L2,
  l1Chain,
  xsollaZkTestnet,
} from '../../src/config';
import { useWallet } from './wallet/useWallet';
import { useBridgeQuote } from './bridge/useBridgeQuote';
import { useBridgeSend, type StepStatus } from './bridge/useBridgeSend';

const STEP_STATE: Record<StepStatus, StepStateType> = {
  pending: 'incomplete',
  sending: 'loading',
  confirming: 'loading',
  done: 'complete',
  error: 'alert',
};

// Viewport centering is the one job the toolkit has no component for —
// see ADR-0002 D3. Everything below this wrapper is FieldGroup-only.
//
// XUIProvider only provides theme *tokens* (context + injected fonts/typography
// CSS) — it never paints a page background itself (see ADR-0002 D11). Without
// this, dark mode is text-only: light-on-transparent over the browser's default
// white canvas.
const PageWrapper = styled.div<{ $background: string }>`
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px;
  background-color: ${(props) => props.$background};
`;

// Only route this POC supports (ADR-0002 D6) — Select is disabled, not a real choice.
const FROM_OPTIONS = [{ label: l1Chain.name, value: 'l1' }];
const TO_OPTIONS = [{ label: xsollaZkTestnet.name, value: 'l2' }];

export function App() {
  const { status, address, isWrongNetwork, error, connect, switchToL1, walletClient } = useWallet();
  const { theme } = useDesignSystem();

  const canBridge = status === 'connected' && !isWrongNetwork;
  const {
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
  } = useBridgeQuote({ walletClient: canBridge ? walletClient : null, address });

  const sendState = useBridgeSend({
    walletClient: canBridge ? walletClient : null,
    address,
    onSettled: refreshBalances,
  });
  const sending = sendState.phase !== 'idle' && sendState.phase !== 'done' && sendState.phase !== 'error';

  return (
    <PageWrapper $background={theme.colors.background.primary}>
      <FieldGroup flexDirection="column" gap={24} maxWidth={480} padding={32}>
        <Typography variant="h2" color="primary">
          USDC Bridge
        </Typography>
        <Typography variant="bodyMd" color="secondary">
          {l1Chain.name} → {xsollaZkTestnet.name}
        </Typography>

        <FieldGroup flexDirection="column" gap={16} label="Wallet">
          {status !== 'connected' && (
            <Button
              variant="primary"
              onPress={connect}
              loading={status === 'connecting'}
              iconLeft={<WalletIcon />}
            >
              Connect MetaMask
            </Button>
          )}

          {status === 'connected' && address && (
            <>
              <Status palette={isWrongNetwork ? 'alert' : 'success'}>
                {isWrongNetwork ? 'Wrong network' : 'Connected'}
              </Status>
              <InputCopy readOnly value={address} label="Connected address" />
            </>
          )}

          {isWrongNetwork && (
            <Notification
              type="inline"
              tone="warning"
              message={`Switch your wallet to ${l1Chain.name} to continue.`}
              actionLabel="Switch network"
              onAction={switchToL1}
            />
          )}

          {error && <Notification type="inline" tone="alert" message={error} />}
        </FieldGroup>

        <FieldGroup flexDirection="column" gap={16} label="Bridge">
          <FieldGroup flexDirection="row" gap={12}>
            <Select label="From" options={FROM_OPTIONS} value="l1" disabled fullWidth />
            <Select label="To" options={TO_OPTIONS} value="l2" disabled fullWidth />
          </FieldGroup>

          <Input
            label="Amount (USDC)"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={!canBridge || sending}
          />
          <Typography variant="bodySm" color="tertiary">
            USDC {USDC_L1} (L1) → {USDC_L2} (L2)
          </Typography>

          {!canBridge && (
            <Typography variant="bodySm" color="secondary">
              Connect a wallet on {l1Chain.name} to see balances and a quote.
            </Typography>
          )}

          {canBridge && (
            <>
              <Divider title="Balances" titlePosition="left" />
              {balancesLoading && !balances && <Spinner size="sm" />}
              {balancesError && <Notification type="inline" tone="alert" message={balancesError} />}
              {balances && (
                <FieldGroup flexDirection="column" gap={8}>
                  <Cell view="stroke">
                    <Cell.Text title="L1 ETH (gas)" titleRight={`${formatEther(balances.ethL1)} ETH`} />
                  </Cell>
                  <Cell view="stroke">
                    <Cell.Text
                      title="L1 USDC"
                      titleRight={`${formatUnits(balances.usdcL1, USDC_DECIMALS)} USDC`}
                    />
                  </Cell>
                  <Cell view="stroke">
                    <Cell.Text title="L1 XZK (fees)" titleRight={`${formatEther(balances.xzkL1)} XZK`} />
                  </Cell>
                  <Cell view="stroke">
                    <Cell.Text
                      title="L2 USDC"
                      titleRight={`${formatUnits(balances.usdcL2, USDC_DECIMALS)} USDC`}
                    />
                  </Cell>
                </FieldGroup>
              )}

              <Divider title="Quote" titlePosition="left" />
              {quoteLoading && <Spinner size="sm" />}
              {quoteError && <Notification type="inline" tone="alert" message={quoteError} />}
              {!quote && !quoteLoading && !quoteError && (
                <Typography variant="bodySm" color="tertiary">
                  Enter an amount to fetch a quote.
                </Typography>
              )}
              {quote && (
                <FieldGroup flexDirection="column" gap={8}>
                  <Cell view="stroke">
                    <Cell.Text title="Route" titleRight={quote.route} />
                  </Cell>
                  <Cell view="stroke">
                    <Cell.Text title="mintValue (L2 fees)" titleRight={`${formatEther(quote.mintValue)} XZK`} />
                  </Cell>
                  <Cell view="stroke">
                    <Cell.Text
                      title="l2GasLimit"
                      titleRight={quote.l2GasLimit ? quote.l2GasLimit.toString() : '—'}
                    />
                  </Cell>
                  <Cell view="stroke">
                    <Cell.Text
                      title="L1 gas (max total)"
                      titleRight={`${formatEther(quote.l1GasMaxTotal)} ETH`}
                    />
                  </Cell>
                  <Cell view="stroke">
                    <Cell.Text title="Approvals needed" titleRight={String(quote.approvalsNeeded)} />
                  </Cell>
                </FieldGroup>
              )}

              {preflight.length > 0 && (
                <>
                  <Divider title="Preflight" titlePosition="left" />
                  <FieldGroup flexDirection="column" gap={8}>
                    {preflight.map((check) => (
                      <Status key={check.label} palette={check.ok ? 'success' : 'alert'}>
                        {check.label} — {check.detail}
                      </Status>
                    ))}
                  </FieldGroup>
                  <Notification
                    type="inline"
                    tone={ready ? 'success' : 'warning'}
                    message={ready ? 'Ready to send.' : 'Not ready to send — see checks above.'}
                  />
                </>
              )}

              {ready && sendState.phase === 'idle' && (
                <Button variant="primary" onPress={() => sendState.send(amount)}>
                  Send
                </Button>
              )}

              {sendState.steps.length > 0 && (
                <>
                  <Divider title="Send" titlePosition="left" />
                  <Stepper
                    direction="vertical"
                    surface
                    steps={sendState.steps.map((step) => ({
                      key: step.key,
                      title: step.description,
                      caption: step.kind,
                      state: STEP_STATE[step.status],
                    }))}
                  />

                  {sendState.phase === 'waiting-l2' && (
                    <FieldGroup flexDirection="row" gap={8}>
                      <Spinner size="sm" />
                      <Typography variant="bodySm" color="secondary">
                        Waiting for L2 execution{sendState.l2Phase ? ` (${sendState.l2Phase})` : ''}…
                      </Typography>
                    </FieldGroup>
                  )}

                  {sendState.l1TxHash && (
                    <InputCopy readOnly label="L1 tx" value={sendState.l1TxHash} />
                  )}
                  {sendState.l1TxHash && (
                    <Link href={`${EXPLORER_L1}/tx/${sendState.l1TxHash}`} target="_blank" rel="noopener noreferrer">
                      View on {EXPLORER_L1.replace('https://', '')}
                    </Link>
                  )}
                  {sendState.l2TxHash && (
                    <InputCopy readOnly label="L2 tx" value={sendState.l2TxHash} />
                  )}
                  {sendState.l2TxHash && (
                    <Link href={`${EXPLORER_L2}/tx/${sendState.l2TxHash}`} target="_blank" rel="noopener noreferrer">
                      View on {EXPLORER_L2.replace('https://', '')}
                    </Link>
                  )}

                  {sendState.phase === 'done' && (
                    <Result
                      variant="modal"
                      title="Bridge complete"
                      description={
                        sendState.delta !== null
                          ? `L2 balance delta: ${formatUnits(sendState.delta, USDC_DECIMALS)} USDC`
                          : undefined
                      }
                      primaryAction={<Button onPress={sendState.reset}>Start another bridge</Button>}
                    />
                  )}

                  {sendState.phase === 'error' && (
                    <Result
                      variant="modal"
                      title="Bridge failed"
                      description={sendState.error ?? undefined}
                      primaryAction={<Button onPress={sendState.reset}>Try again</Button>}
                    />
                  )}
                </>
              )}
            </>
          )}
        </FieldGroup>
      </FieldGroup>
    </PageWrapper>
  );
}
