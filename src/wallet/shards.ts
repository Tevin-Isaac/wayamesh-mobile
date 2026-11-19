import { ethers } from 'ethers';

// Pure shard helpers (no keystore import, so they run under node tests). Payload format {v:1,i,t,n,a,s} is shared with
// the Arc Studio web wallet (section 7 of its porting guide).

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sss = require('shamirs-secret-sharing') as {
  split(secret: Buffer, opts: { shares: number; threshold: number }): Buffer[];
  combine(shares: Buffer[]): Buffer;
};
export { sss };

export interface GuardianShard {
  index:       number;
  total:       number;
  threshold:   number;
  shardBase64: string;
  address:     string;
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

interface ShardPayload {
  v: number; i: number; t: number; n: number; a: string; s: string;
}

/** Parse and validate a single shard payload string (no wallet context needed). */
function parseShardPayload(raw: string): ShardPayload {
  let p: unknown;
  try {
    p = JSON.parse(raw.trim());
  } catch {
    throw new Error('That is not valid shard data — paste the full shard text');
  }
  const o = p as Partial<ShardPayload>;
  if (o.v !== 1) throw new Error('Unknown shard format version');
  if (
    typeof o.i !== 'number' || typeof o.t !== 'number' || typeof o.n !== 'number' ||
    typeof o.a !== 'string'  || typeof o.s !== 'string'
  ) {
    throw new Error('Shard is missing required fields');
  }
  if (!Number.isInteger(o.i) || !Number.isInteger(o.t) || !Number.isInteger(o.n) || o.t < 2 || o.n < o.t || o.n > 10 || o.i < 1 || o.i > o.n) {
    throw new Error('A shard has impossible numbers. It may be fake');
  }
  if (!/^[0-9a-fA-F]{8}$/.test(o.a) || o.s.length > 400 || !/^[A-Za-z0-9+/=]+$/.test(o.s)) {
    throw new Error('A shard is damaged');
  }
  return o as ShardPayload;
}

/**
 * Recover the private key from shard payload strings (the format produced by
 * shardToPayload). Used during device-loss recovery, when the full address is
 * unknown. Validates the shards belong to the same wallet, are distinct, and
 * meet the threshold; then verifies the reconstructed key derives a matching
 * address before returning it.
 */
export function recoverFromPayloads(payloads: string[]): string {
  const parsed = payloads
    .map(p => p.trim())
    .filter(Boolean)
    .map(parseShardPayload);

  if (parsed.length < 2) throw new Error('Enter at least 2 shards');

  const threshold = parsed[0].t;
  const suffix    = parsed[0].a.toLowerCase();

  for (const p of parsed) {
    if (p.a.toLowerCase() !== suffix) {
      throw new Error('These shards are from different wallets');
    }
  }
  const distinct = new Set(parsed.map(p => p.i));
  if (distinct.size !== parsed.length) {
    throw new Error('You entered the same shard twice — use different shards');
  }
  if (parsed.length < threshold) {
    throw new Error(`Need at least ${threshold} different shards to recover`);
  }

  const buffers   = parsed.map(p => Buffer.from(p.s, 'base64'));
  const recovered = sss.combine(buffers);
  const privateKey = '0x' + recovered.toString('hex');

  // Sanity gate: the reconstructed key must derive an address ending in the
  // shards' address suffix. Wrong/garbled shards fail here instead of silently
  // producing a valid-but-empty wallet.
  let derived: string;
  try {
    derived = new ethers.Wallet(privateKey).address.toLowerCase();
  } catch {
    throw new Error('Recovery failed — the shards did not reconstruct a valid key');
  }
  if (!derived.endsWith(suffix)) {
    throw new Error('Recovery failed — check the shards are correct and complete');
  }
  return privateKey;
}
