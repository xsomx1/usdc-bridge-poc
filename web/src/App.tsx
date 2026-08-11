import styled from 'styled-components';
import { Typography } from '@xsolla/xui-typography';
import { FieldGroup } from '@xsolla/xui-field-group';

import { l1Chain, xsollaZkTestnet, USDC_L1, USDC_L2 } from '../../src/config';

// Viewport centering is the one job the toolkit has no component for —
// see ADR-0002 D3. Everything below this wrapper is FieldGroup-only.
const PageWrapper = styled.div`
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px;
`;

export function App() {
  return (
    <PageWrapper>
      <FieldGroup flexDirection="column" gap={24} maxWidth={480} padding={32}>
        <Typography variant="h2" color="primary">
          USDC Bridge
        </Typography>
        <Typography variant="bodyMd" color="secondary">
          {l1Chain.name} → {xsollaZkTestnet.name}
        </Typography>

        {/* Empty form shell — wallet connect (E6), amount + quote (E7),
            and the send stepper (E8) all land inside this group. */}
        <FieldGroup flexDirection="column" gap={16} label="Bridge">
          <Typography variant="bodySm" color="tertiary">
            USDC {USDC_L1} (L1) → {USDC_L2} (L2)
          </Typography>
        </FieldGroup>
      </FieldGroup>
    </PageWrapper>
  );
}
