import {
  maxUint256, erc20Abi, parseErc6492Signature, getContract,
  type PublicClient, type Address,
} from 'viem';

// EIP-2612 permit signing for the Circle Paymaster — lets the paymaster pull USDC
// to cover gas WITHOUT a separate on-chain approval (so the user never needs a
// native gas token). Adapted from Circle's official Paymaster v0.7 quickstart.

const eip2612Abi = [
  ...erc20Abi,
  {
    inputs: [{ internalType: 'address', name: 'owner', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
    name: 'nonces',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  },
  {
    inputs: [],
    name: 'version',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

interface SignPermitArgs {
  tokenAddress: Address;
  client: PublicClient;
  // The smart account (must expose signTypedData) — viem SmartAccount.
  account: { address: Address; signTypedData: (args: unknown) => Promise<`0x${string}`> };
  spenderAddress: Address;
  permitAmount: bigint;
}

export async function signPermit({
  tokenAddress, client, account, spenderAddress, permitAmount,
}: SignPermitArgs): Promise<`0x${string}`> {
  const token = getContract({ client, address: tokenAddress, abi: eip2612Abi });

  const permitData = {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Permit' as const,
    domain: {
      name: await token.read.name(),
      version: await token.read.version(),
      chainId: client.chain!.id,
      verifyingContract: tokenAddress,
    },
    message: {
      owner: account.address,
      spender: spenderAddress,
      value: permitAmount,
      nonce: await token.read.nonces([account.address]),
      // The paymaster can't read block.timestamp under 4337 opcode rules, so the
      // permit deadline must be MAX_UINT256.
      deadline: maxUint256,
    },
  };

  const wrapped = await account.signTypedData(permitData);
  const { signature } = parseErc6492Signature(wrapped);
  return signature;
}
