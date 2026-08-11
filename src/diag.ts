import { createPublicClient, http, formatEther, formatUnits, parseAbi } from 'viem';
import { getL2TransactionHashFromLogs } from '@matterlabs/zksync-js/viem';
import { L1_RPC, L2_RPC, USDC_L1, USDC_L2, XZK_L1, l1Chain, xsollaZkTestnet } from './config';

const L1_TX = '0x24a21d52d89404ffc2318146fe4df6a8e0407f6c19ebecfffc8b818ae9548a03' as const;
const ME = '0x26e99F6e94B983e0adD40E296D4f5788e67C9F69' as const;
const l1 = createPublicClient({ chain: l1Chain, transport: http(L1_RPC) });
const l2 = createPublicClient({ chain: xsollaZkTestnet, transport: http(L2_RPC) });

const rc = await l1.getTransactionReceipt({ hash: L1_TX });
console.log('L1 status      :', rc.status, 'gasUsed', rc.gasUsed);
const l2Hash = getL2TransactionHashFromLogs(rc.logs as never);
console.log('L2 tx hash     :', l2Hash);

if (l2Hash) {
  const l2rc = await l2.getTransactionReceipt({ hash: l2Hash }).catch((e) => { console.log('L2 receipt err:', e.shortMessage); return null; });
  if (l2rc) {
    console.log('L2 status      :', l2rc.status);
    console.log('L2 gasUsed     :', l2rc.gasUsed, ' (gasLimit sent: 362493)');
    console.log('L2 logs        :', l2rc.logs.length);
  }
  const l2tx = await l2.getTransaction({ hash: l2Hash }).catch(() => null);
  if (l2tx) console.log('L2 tx gas      :', l2tx.gas, 'to', l2tx.to);
}

const erc = parseAbi(['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)']);
const r = (a: `0x${string}`, c = l1) => c.readContract({ address: a, abi: erc, functionName: 'balanceOf', args: [ME] }) as Promise<bigint>;
console.log('--- balances now ---');
console.log('L1 USDC        :', formatUnits(await r(USDC_L1), 6), '(was 20 before send)');
console.log('L1 XZK         :', formatEther(await r(XZK_L1)), '(was 100.000000000001)');
console.log('L1 ETH         :', formatEther(await l1.getBalance({ address: ME })));
console.log('L2 USDC        :', formatUnits(await r(USDC_L2, l2), 6));
