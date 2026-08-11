/**
 * Bridge USDC from Ethereum Sepolia → Xsolla ZK Testnet (chain 579029).
 *
 *   bun run bridge:dry    # preflight + quote + prepare + calldata diff vs reference tx. Sends nothing.
 *   bun run bridge:send   # everything above, then approve(s) + bridge tx, then wait for L2.
 *
 * The SDK picks the `erc20-nonbase` route: USDC is not the chain's base token (XZK is),
 * so fees are paid in XZK via allowance and msg.value stays 0.
 */

import {
  createPublicClient,
  createWalletClient,
  decodeFunctionData,
  encodeFunctionData,
  formatEther,
  formatUnits,
  http,
  parseAbi,
  parseUnits,
  type Account,
  type Chain,
  type Transport,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createViemClient, createViemSdk } from '@matterlabs/zksync-js/viem';
import { abi } from '@matterlabs/zksync-js/core';

import {
  AMOUNT_USDC,
  EXPLORER_L1,
  EXPLORER_L2,
  L1_RPC,
  L2_GAS_LIMIT,
  L2_RPC,
  REFERENCE_TX,
  USDC_DECIMALS,
  USDC_L1,
  USDC_L2,
  XZK_L1,
  l1Chain,
  xsollaZkTestnet,
} from './config';

const SEND = process.argv.includes('--send');
const erc20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
]);

const h = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const row = (k: string, v: unknown) => console.log(`  ${k.padEnd(26)} ${v}`);
const mark = (ok: boolean) => (ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m');

/**
 * A dry run only reads and builds — it never signs. So it accepts a bare ACCOUNT
 * address and no key at all, which keeps the private key out of the flow entirely
 * until the moment we actually send.
 */
function resolveAccount(): Account | `0x${string}` {
  const pk = process.env.PRIVATE_KEY;
  if (pk && /^0x[0-9a-fA-F]{64}$/.test(pk)) return privateKeyToAccount(pk as `0x${string}`);
  if (SEND) throw new Error('bridge:send needs a 0x-prefixed 32-byte PRIVATE_KEY in .env');

  const addr = process.env.ACCOUNT;
  if (addr && /^0x[0-9a-fA-F]{40}$/.test(addr)) return addr as `0x${string}`;
  throw new Error('Set PRIVATE_KEY, or ACCOUNT=0x… for a read-only dry run (see .env.example)');
}

/** Decode a Bridgehub.requestL2TransactionTwoBridges calldata into a flat, comparable shape. */
function decodeTwoBridges(data: `0x${string}`) {
  const { functionName, args } = decodeFunctionData({ abi: abi.IBridgehubABI, data });
  if (functionName !== 'requestL2TransactionTwoBridges') {
    throw new Error(`unexpected function: ${functionName}`);
  }
  const s = (args as readonly unknown[])[0] as {
    chainId: bigint;
    mintValue: bigint;
    l2Value: bigint;
    l2GasLimit: bigint;
    l2GasPerPubdataByteLimit: bigint;
    refundRecipient: `0x${string}`;
    secondBridgeAddress: `0x${string}`;
    secondBridgeValue: bigint;
    secondBridgeCalldata: `0x${string}`;
  };
  const body = s.secondBridgeCalldata.slice(2);
  return {
    ...s,
    // V1 ERC-20 encoding for L1-origin tokens: abi.encode(address token, uint256 amount, address receiver)
    secondBridgeCalldataBytes: body.length / 2,
    token: `0x${body.slice(24, 64)}` as `0x${string}`,
    amount: BigInt(`0x${body.slice(64, 128)}`),
    l2Receiver: `0x${body.slice(152, 192)}` as `0x${string}`,
  };
}

async function main() {
  const account = resolveAccount();
  const l1 = createPublicClient({ chain: l1Chain, transport: http(L1_RPC) });
  const l2 = createPublicClient({ chain: xsollaZkTestnet, transport: http(L2_RPC) });
  const l1Wallet = createWalletClient({
    account,
    chain: l1Chain,
    transport: http(L1_RPC),
  }) as WalletClient<Transport, Chain, Account>;
  const me = l1Wallet.account.address;
  console.log(`mode: ${SEND ? 'SEND' : 'DRY RUN'}   signer: ${typeof account === 'string' ? 'address only (no key)' : 'local key'}`);

  const client = createViemClient({ l1, l2, l1Wallet });
  const sdk = createViemSdk(client);
  const amount = parseUnits(AMOUNT_USDC, USDC_DECIMALS);
  const params = { token: USDC_L1, to: me, amount, l2GasLimit: L2_GAS_LIMIT } as const;

  h('Network');
  const addrs = await client.ensureAddresses();
  row('L1 chainId', await l1.getChainId());
  row('L2 chainId', await l2.getChainId());
  row('Bridgehub', addrs.bridgehub);
  row('L1 AssetRouter', addrs.l1AssetRouter);
  row('L1 NativeTokenVault', addrs.l1NativeTokenVault);
  const baseToken = await client.baseToken(BigInt(await l2.getChainId()));
  row('L2 base token', `${baseToken} (XZK — not ETH)`);

  h('Token');
  const token = await sdk.tokens.resolve(USDC_L1, { chain: 'l1' });
  row('kind', token.kind);
  row('L1 address', token.l1);
  row('L2 address', token.l2);
  row('assetId', token.assetId);
  row('isChainEthBased', token.isChainEthBased);

  h(`Wallet ${me}`);
  const read = (t: `0x${string}`, fn: 'balanceOf' | 'allowance', args: unknown[]) =>
    l1.readContract({ address: t, abi: erc20, functionName: fn, args }) as Promise<bigint>;
  const [ethBal, usdcBal, xzkBal, usdcAllow, xzkAllow, l2UsdcBefore] = await Promise.all([
    l1.getBalance({ address: me }),
    read(USDC_L1, 'balanceOf', [me]),
    read(XZK_L1, 'balanceOf', [me]),
    read(USDC_L1, 'allowance', [me, addrs.l1AssetRouter]),
    read(XZK_L1, 'allowance', [me, addrs.l1AssetRouter]),
    l2.readContract({
      address: USDC_L2,
      abi: erc20,
      functionName: 'balanceOf',
      args: [me],
    }) as Promise<bigint>,
  ]);
  row('L1 ETH (gas)', formatEther(ethBal));
  row('L1 USDC', formatUnits(usdcBal, USDC_DECIMALS));
  row('L1 XZK (fees)', formatEther(xzkBal));
  row('allowance USDC→Router', formatUnits(usdcAllow, USDC_DECIMALS));
  row('allowance XZK→Router', formatEther(xzkAllow));
  row('L2 USDC (before)', formatUnits(l2UsdcBefore, USDC_DECIMALS));

  h('Quote');
  const quote = await sdk.deposits.quote(params);
  const mintValue = quote.fees.mintValue ?? 0n;
  row('route', quote.route);
  row('amount', `${formatUnits(amount, USDC_DECIMALS)} USDC`);
  row('fee token', quote.fees.token);
  row('mintValue (L2 fees)', `${formatEther(mintValue)} XZK`);
  row('l2GasLimit', `${quote.fees.l2?.gasLimit}${L2_GAS_LIMIT ? ' (overridden)' : ' (SDK estimate)'}`);
  row('L1 gas maxTotal', `${formatEther(quote.fees.l1?.maxTotal ?? 0n)} ETH`);
  row('approvals needed', quote.approvalsNeeded.length);
  for (const a of quote.approvalsNeeded) {
    row('  → approve', `${a.token} amount=${a.amount}`);
  }

  h('Prepare (no send)');
  const plan = await sdk.deposits.prepare(params);
  for (const step of plan.steps) row(step.kind, step.description);

  const bridgeStep = plan.steps.find((s) => s.kind === 'bridgehub:two-bridges');
  if (!bridgeStep) throw new Error('no bridgehub step in plan');
  const tx = bridgeStep.tx as {
    address: `0x${string}`;
    abi: typeof abi.IBridgehubABI;
    functionName: 'requestL2TransactionTwoBridges';
    args: readonly unknown[];
    value: bigint;
  };
  const ourCalldata = encodeFunctionData({
    abi: tx.abi,
    functionName: tx.functionName,
    args: tx.args,
  });

  h(`Calldata diff vs reference tx ${REFERENCE_TX.slice(0, 12)}…`);
  const refTx = await l1.getTransaction({ hash: REFERENCE_TX });
  const ref = decodeTwoBridges(refTx.input);
  const ours = decodeTwoBridges(ourCalldata);
  // Structural fields must match the proven tx exactly — they encode the route and the protocol shape.
  const structural: [string, unknown, unknown, boolean][] = [
    ['selector', refTx.input.slice(0, 10), ourCalldata.slice(0, 10), refTx.input.slice(0, 10) === ourCalldata.slice(0, 10)],
    ['to (Bridgehub)', refTx.to, tx.address, refTx.to?.toLowerCase() === tx.address.toLowerCase()],
    ['msg.value', refTx.value, tx.value, refTx.value === tx.value],
    ['chainId', ref.chainId, ours.chainId, ref.chainId === ours.chainId],
    ['l2Value', ref.l2Value, ours.l2Value, ref.l2Value === ours.l2Value],
    ['gasPerPubdata', ref.l2GasPerPubdataByteLimit, ours.l2GasPerPubdataByteLimit, ref.l2GasPerPubdataByteLimit === ours.l2GasPerPubdataByteLimit],
    ['secondBridgeAddress', ref.secondBridgeAddress, ours.secondBridgeAddress, ref.secondBridgeAddress.toLowerCase() === ours.secondBridgeAddress.toLowerCase()],
    ['secondBridgeValue', ref.secondBridgeValue, ours.secondBridgeValue, ref.secondBridgeValue === ours.secondBridgeValue],
    ['bridge calldata bytes', ref.secondBridgeCalldataBytes, ours.secondBridgeCalldataBytes, ref.secondBridgeCalldataBytes === ours.secondBridgeCalldataBytes],
    ['bridged token', ref.token, ours.token, ref.token.toLowerCase() === ours.token.toLowerCase()],
    ['amount', ref.amount, ours.amount, ref.amount === ours.amount],
  ];
  console.log(`  ${'field'.padEnd(22)} ${'reference'.padEnd(46)} ours`);
  for (const [k, a, b, ok] of structural) {
    console.log(`${mark(ok)} ${k.padEnd(22)} ${String(a).padEnd(46)} ${String(b)}`);
  }
  const structuralOk = structural.every(([, , , ok]) => ok);
  console.log(`  structural match: ${mark(structuralOk)}`);

  // These are expected to differ; printed so the difference stays an explicit decision, not a surprise.
  console.log('\n  expected to differ:');
  const informational: [string, unknown, unknown, string][] = [
    ['l2GasLimit', ref.l2GasLimit, ours.l2GasLimit, 'reference was the first bridge of USDC and paid for L2 token deployment'],
    ['mintValue', `${formatEther(ref.mintValue)} XZK`, `${formatEther(ours.mintValue)} XZK`, 'scales with l2GasLimit and live L1 gas price'],
    ['refundRecipient', ref.refundRecipient, ours.refundRecipient, 'our wallet'],
    ['l2Receiver', ref.l2Receiver, ours.l2Receiver, 'our wallet'],
  ];
  for (const [k, a, b, why] of informational) {
    console.log(`  · ${k.padEnd(20)} ${String(a).padEnd(46)} ${String(b)}\n      ${why}`);
  }

  h('Preflight for send');
  const checks: [string, boolean, string][] = [
    ['USDC balance ≥ amount', usdcBal >= amount, `${formatUnits(usdcBal, USDC_DECIMALS)} / ${formatUnits(amount, USDC_DECIMALS)}`],
    ['mintValue is non-zero', mintValue > 0n, formatEther(mintValue)],
    ['XZK balance ≥ mintValue', mintValue > 0n && xzkBal >= mintValue, `${formatEther(xzkBal)} / ${formatEther(mintValue)}`],
    ['ETH for L1 gas > 0', ethBal > 0n, formatEther(ethBal)],
    ['calldata structurally ok', structuralOk, ''],
  ];
  for (const [k, ok, detail] of checks) console.log(`${mark(ok)} ${k.padEnd(26)} ${detail}`);
  const ready = checks.every(([, ok]) => ok);

  if (!SEND) {
    console.log(`\nDry run finished. ${ready ? 'Ready to send — rerun with bun run bridge:send' : 'NOT ready to send (see ✗ above).'}`);
    return;
  }
  if (!ready) throw new Error('Preflight failed — refusing to send. See ✗ above.');

  h('Send');
  const handle = await sdk.deposits.create(params);
  row('L1 tx', `${EXPLORER_L1}/tx/${handle.l1TxHash}`);
  for (const [key, hash] of Object.entries(handle.stepHashes ?? {})) {
    row(`  step ${key}`, `${EXPLORER_L1}/tx/${hash}`);
  }

  console.log('\n  waiting for L1 inclusion…');
  const l1Receipt = await sdk.deposits.wait(handle, { for: 'l1' });
  row('L1 block', l1Receipt?.blockNumber);

  console.log('  waiting for L2 execution…');
  const l2Receipt = await sdk.deposits.wait(handle, { for: 'l2' });
  const status = await sdk.deposits.status(handle);
  row('phase', status.phase);
  row('L2 tx', status.l2TxHash ? `${EXPLORER_L2}/tx/${status.l2TxHash}` : '—');
  row('L2 block', l2Receipt?.blockNumber ?? '—');

  const l2UsdcAfter = (await l2.readContract({
    address: USDC_L2,
    abi: erc20,
    functionName: 'balanceOf',
    args: [me],
  })) as bigint;
  h('Result');
  row('L2 USDC before', formatUnits(l2UsdcBefore, USDC_DECIMALS));
  row('L2 USDC after', formatUnits(l2UsdcAfter, USDC_DECIMALS));
  row('delta', formatUnits(l2UsdcAfter - l2UsdcBefore, USDC_DECIMALS));
  console.log(`\n  ${mark(l2UsdcAfter - l2UsdcBefore === amount)} bridged amount matches`);
}

main().catch((e) => {
  console.error('\n\x1b[31mFAILED\x1b[0m', e);
  process.exit(1);
});
