import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { Config } from './config.js';
import { HttpError, type RampService } from './ramp.js';

const MAX_BODY = 16 * 1024;

class Limiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number) {}
  ok(key: string) {
    const now = Date.now();
    const arr = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    if (arr.length >= this.max) { this.hits.set(key, arr); return false; }
    arr.push(now); this.hits.set(key, arr);
    if (this.hits.size > 10_000) this.hits.clear();
    return true;
  }
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(new HttpError(400, 'invalid json')); }
    });
    req.on('error', reject);
  });
}

const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function createApp(cfg: Config, ramp: RampService) {
  const ipLimit = new Limiter(60, 60_000);
  const addrLimit = new Limiter(5, 60_000);

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin;
    if (origin && (cfg.origins.includes('*') || cfg.origins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', cfg.origins.includes('*') ? '*' : origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    try {
      const url = new URL(req.url ?? '/', 'http://x');
      const path = url.pathname;
      const ip = req.socket.remoteAddress ?? 'unknown';
      if (!ipLimit.ok(ip)) throw new HttpError(429, 'too many requests');

      if (req.method === 'GET' && path === '/api/ramp/config') return send(200, ramp.config());
      const m = path.match(/^\/api\/ramp\/orders\/([0-9a-f-]{36})$/);
      if (req.method === 'GET' && m) return send(200, ramp.getOrder(m[1]));

      if (req.method === 'POST') {
        if (path.startsWith('/api/ramp/mpesa/')) {
          // Safaricom webhooks: shared-secret token in query; always ACK 200 to avoid retries storms.
          if (!cfg.mock && !safeEq(url.searchParams.get('token') ?? '', cfg.callbackSecret)) throw new HttpError(403, 'forbidden');
          const body = await readBody(req);
          if (path.endsWith('/callback')) await ramp.onStkCallback(body);
          else if (path.endsWith('/b2c/result')) await ramp.onB2cResult(body);
          else if (path.endsWith('/b2c/timeout')) ramp.onB2cTimeout(body);
          else throw new HttpError(404, 'not found');
          return send(200, { ResultCode: 0, ResultDesc: 'Accepted' });
        }
        if (path === '/api/ramp/onramp/mpesa' || path === '/api/ramp/offramp/mpesa') {
          const body = await readBody(req);
          if (typeof body.address === 'string' && !addrLimit.ok(body.address.toLowerCase())) throw new HttpError(429, 'too many requests for this address');
          const r = path.includes('onramp') ? await ramp.startOnramp(body) : await ramp.startOfframp(body);
          return send(200, r);
        }
      }
      throw new HttpError(404, 'not found');
    } catch (e: any) {
      if (e instanceof HttpError) return send(e.status, { error: e.message });
      console.error('unhandled error:', e?.message);
      return send(500, { error: 'internal error' });
    }
  });
}
