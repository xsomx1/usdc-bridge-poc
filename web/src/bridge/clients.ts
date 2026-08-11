import { createPublicClient, http } from 'viem';

// Same public RPCs as the CLI POC (ADR-0002 D5) — CORS is open, no proxy needed.
// Stateless reads, so one pair of clients for the whole app.
import { L1_RPC, L2_RPC, l1Chain, xsollaZkTestnet } from '../../../src/config';

export const l1PublicClient = createPublicClient({ chain: l1Chain, transport: http(L1_RPC) });
export const l2PublicClient = createPublicClient({ chain: xsollaZkTestnet, transport: http(L2_RPC) });
