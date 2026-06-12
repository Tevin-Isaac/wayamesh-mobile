import { readPrivateKey } from './keystore';

// shamirs-secret-sharing is CommonJS; typed inline to avoid declaration issues.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sss = require('shamirs-secret-sharing') as {
  split(secret: Buffer, opts: { shares: number; threshold: number }): Buffer[];
  combine(shares: Buffer[]): Buffer;
};

export interface GuardianShard {
  index:       number;
  total:       number;
  threshold:   number;
  shardBase64: string;
  address:     string;
}

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

/**
 * Encode a shard as compact JSON for QR code display or text sharing.
 * `a` is the last 8 chars of the wallet address — for guardian verification only.
 */
export function shardToPayload(shard: GuardianShard): string {
  return JSON.stringify({
    v: 1,
    i: shard.index,
    t: shard.threshold,
    n: shard.total,
    a: shard.address.slice(-8),
    s: shard.shardBase64,
  });
}

/** Parse a shard payload back into a GuardianShard. Verifies address suffix. */
export function payloadToShard(json: string, fullAddress: string): GuardianShard {
  const p = JSON.parse(json);
  if (p.v !== 1) throw new Error('Unknown shard format version');
  if (!fullAddress.toLowerCase().endsWith(p.a.toLowerCase())) {
    throw new Error('Shard does not belong to this wallet');
  }
  return {
    index:       p.i,
    total:       p.n,
    threshold:   p.t,
    shardBase64: p.s,
    address:     fullAddress,
  };
}
