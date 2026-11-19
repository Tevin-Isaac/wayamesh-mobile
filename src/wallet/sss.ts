import { readPrivateKey } from './keystore';

import { sss, type GuardianShard } from './shards';

export { shardToPayload, payloadToShard, recoverFromPayloads, type GuardianShard } from './shards';

/**
 * Split the wallet private key into `total` shards; any `threshold` can reconstruct.
 * Default: 2-of-3. Shards are safe to store separately — one shard reveals nothing.
 */
export async function splitPrivateKey(
  address: string,
  threshold = 2,
  total     = 3,
): Promise<GuardianShard[]> {
  const pk = await readPrivateKey('Authenticate to split your key into guardian shards');
  if (!pk) throw new Error('No wallet found');

  const keyBytes = Buffer.from(pk.replace(/^0x/, ''), 'hex');
  const shares   = sss.split(keyBytes, { shares: total, threshold });

  return shares.map((share, i) => ({
    index:       i + 1,
    total,
    threshold,
    shardBase64: share.toString('base64'),
    address,
  }));
}

/**
 * Reconstruct a private key from at least `threshold` shards.
 * Returns the 0x-prefixed private key hex string.
 */
export function combineShards(shards: GuardianShard[]): string {
  if (shards.length < 2) throw new Error('Need at least 2 shards');
  const buffers  = shards.map(s => Buffer.from(s.shardBase64, 'base64'));
  const recovered = sss.combine(buffers);
  return '0x' + recovered.toString('hex');
}

