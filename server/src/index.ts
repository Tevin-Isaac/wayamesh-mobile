import { loadDotEnv, loadConfig } from './config.js';
import { Store } from './store.js';
import { MockDaraja, RealDaraja } from './daraja.js';
import { ArcTreasury, arcChain } from './treasury.js';
import { RampService } from './ramp.js';
import { createApp } from './server.js';

loadDotEnv();
const cfg = loadConfig();
const treasury = new ArcTreasury(cfg.rpcUrl, cfg.treasuryKey);
const ramp = new RampService({
  cfg, store: new Store(cfg.dataFile), daraja: cfg.mock ? new MockDaraja() : new RealDaraja(cfg),
  treasury, chain: arcChain(cfg.rpcUrl),
});
createApp(cfg, ramp).listen(cfg.port, () => {
  console.log(`ramp server on :${cfg.port} mode=${cfg.mode} treasury=${treasury.address ?? 'none (mock payouts)'}`);
});
