import styled from 'styled-components';
import { useDesignSystem } from '@xsolla/xui-core';
import { Typography } from '@xsolla/xui-typography';
import { FieldGroup } from '@xsolla/xui-field-group';
import { Button } from '@xsolla/xui-button';
import { Status } from '@xsolla/xui-status';
import { Notification } from '@xsolla/xui-notification';
import { InputCopy } from '@xsolla/xui-input-copy';
import { Wallet as WalletIcon } from '@xsolla/xui-icons-base';

import { l1Chain, xsollaZkTestnet, USDC_L1, USDC_L2 } from '../../src/config';
import { useWallet } from './wallet/useWallet';

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

export function App() {
  const { status, address, isWrongNetwork, error, connect, switchToL1 } = useWallet();
  const { theme } = useDesignSystem();

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

        {/* Amount + quote (E7) and the send stepper (E8) land inside this group. */}
        <FieldGroup flexDirection="column" gap={16} label="Bridge">
          <Typography variant="bodySm" color="tertiary">
            USDC {USDC_L1} (L1) → {USDC_L2} (L2)
          </Typography>
        </FieldGroup>
      </FieldGroup>
    </PageWrapper>
  );
}
