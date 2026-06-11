import { ethers } from 'ethers';
import { ACTIVE_CHAIN, type ChainConfig } from '@/constants/chain';

// Per-chain RPC state — remembers last-working endpoint index
const activeIndexByChain: Record<string, number> = {};

function makeProvider(rpcUrl: string, chain: ChainConfig): ethers.JsonRpcProvider {
  const network = { chainId: chain.chainId, name: chain.name };
  return new ethers.JsonRpcProvider(rpcUrl, network, {
    staticNetwork: ethers.Network.from(network),
  });
}

/**
 * Execute an RPC call with automatic failover across all endpoints for the given chain.
 * Defaults to ACTIVE_CHAIN when no chain is specified.
 */
export async function withRpc<T>(
  fn: (provider: ethers.JsonRpcProvider) => Promise<T>,
  chain: ChainConfig = ACTIVE_CHAIN,
): Promise<T> {
  const rpcs  = [chain.rpc, ...chain.rpcFallbacks];
  const start = activeIndexByChain[chain.id] ?? 0;
  const len   = rpcs.length;

  for (let attempt = 0; attempt < len; attempt++) {
    const idx = (start + attempt) % len;
    try {
      const provider = makeProvider(rpcs[idx], chain);
      const result   = await fn(provider);
      activeIndexByChain[chain.id] = idx;
      return result;
    } catch (err) {
      if (attempt === len - 1) throw err;
    }
  }

  throw new Error(`All RPC endpoints unreachable for ${chain.name}`);
}
