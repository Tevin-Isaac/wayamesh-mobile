import {
  createPublicClient, http, encodePacked, erc20Abi, getContract,
  defineChain, parseUnits, formatUnits, type Chain, type PublicClient,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createBundlerClient, type SmartAccount } from 'viem/account-abstraction';
import { toCircleSmartAccount } from '@circle-fin/modular-wallets-core';
import { ACTIVE_AA_NETWORK, BUNDLER_URL, type AaConfig } from '@/constants/aa';
import { readPrivateKey } from './keystore';
import { signPermit } from './permit';

// ─────────────────────────────────────────────────────────────────────────────
// Smart-account wallet (ERC-4337) with Circle Paymaster — users pay gas in USDC,
// never a native token. The device key (in SecureStore) is the OWNER/signer; the
// smart account is a separate contract address it controls. Self-custody is
// preserved: only the owner key can authorize operations.
//
// Built to Circle's official Paymaster v0.7 quickstart. The same code targets Arc
// once its mainnet ships (see ACTIVE_AA_NETWORK / AA_NETWORKS).
//
// REQUIRES on-device verification: viem/@circle in React Native need crypto
// polyfills (e.g. react-native-get-random-values) loaded at app entry, and a
// bundler endpoint. Not yet wired into the send flow — see migration plan.
// ─────────────────────────────────────────────────────────────────────────────

function viemChain(cfg: AaConfig): Chain {
  if (cfg.key === 'base-sepolia') return baseSepolia;
  if (cfg.key === 'base-mainnet') return base;
  // Arc has no built-in viem chain yet — define it from our verified config.
  return defineChain({
    id: cfg.chainId,
    name: 'Arc Testnet',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
  });
}

function publicClient(cfg: AaConfig = ACTIVE_AA_NETWORK): PublicClient {
  return createPublicClient({ chain: viemChain(cfg), transport: http(cfg.rpcUrl) });
}

async function ownerAccount() {
  const pk = await readPrivateKey('Authenticate to access your wallet');
  if (!pk) throw new Error('Wallet key unavailable');
  return privateKeyToAccount(pk as `0x${string}`);
}

/** Derive this device's Circle smart-account address (counterfactual; no tx). */
export async function getSmartAccountAddress(cfg: AaConfig = ACTIVE_AA_NETWORK): Promise<string> {
  const client = publicClient(cfg);
  const owner = await ownerAccount();
  const account = await toCircleSmartAccount({ client, owner });
  return account.address;
}

/** On-chain USDC balance of the smart account (human string, 6dp). */
export async function getSmartAccountUsdcBalance(cfg: AaConfig = ACTIVE_AA_NETWORK): Promise<string> {
  const client = publicClient(cfg);
  const owner = await ownerAccount();
  const account = await toCircleSmartAccount({ client, owner });
  const usdc = getContract({ client, address: cfg.usdc as `0x${string}`, abi: erc20Abi });
  const bal = (await usdc.read.balanceOf([account.address])) as bigint;
  return formatUnits(bal, 6);
}

/**
 * Send USDC from the smart account, paying gas in USDC via Circle Paymaster.
 * Returns the on-chain transaction hash. Requires a reachable bundler.
 */
export async function sendUsdcSponsored(
  toAddress: string,
  amountUsdc: string,
  cfg: AaConfig = ACTIVE_AA_NETWORK,
): Promise<string> {
  const client = publicClient(cfg);
  const owner = await ownerAccount();
  const account: SmartAccount = await toCircleSmartAccount({ client, owner });

  const paymaster = {
    async getPaymasterData() {
      // Allowance the paymaster may pull for gas (10 USDC headroom). The actual
      // gas cost is far smaller; unused allowance is not spent.
      const permitAmount = 10_000_000n;
      const permitSignature = await signPermit({
        tokenAddress: cfg.usdc as `0x${string}`,
        client,
        account: account as unknown as {
          address: `0x${string}`;
          signTypedData: (a: unknown) => Promise<`0x${string}`>;
        },
        spenderAddress: cfg.paymaster as `0x${string}`,
        permitAmount,
      });
      const paymasterData = encodePacked(
        ['uint8', 'address', 'uint256', 'bytes'],
        [0, cfg.usdc as `0x${string}`, permitAmount, permitSignature],
      );
      return {
        paymaster: cfg.paymaster as `0x${string}`,
        paymasterData,
        paymasterVerificationGasLimit: 200_000n,
        paymasterPostOpGasLimit: 15_000n,
        isFinal: true,
      };
    },
  };

  const bundlerClient = createBundlerClient({
    account,
    client,
    paymaster,
    transport: http(BUNDLER_URL),
  });

  const hash = await bundlerClient.sendUserOperation({
    account,
    calls: [{
      to: cfg.usdc as `0x${string}`,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [toAddress as `0x${string}`, parseUnits(amountUsdc, 6)],
    }],
  });

  const receipt = await bundlerClient.waitForUserOperationReceipt({ hash });
  return receipt.receipt.transactionHash;
}
