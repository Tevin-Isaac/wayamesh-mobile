import { getDb } from '@/db/schema';
import {
  evaluateSpend, initialState,
  type AgentPolicy, type AgentState, type SpendDecision,
} from './policy';

// Persistence for the autonomous agent: the user's mandate (policy), the running
// spend state, and an append-only audit log of every proposal + decision.
// Amounts are stored as TEXT (USDC base units) to preserve bigint precision.

function ensureTables(): void {
  getDb().execSync(`
    CREATE TABLE IF NOT EXISTS agent_policy (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      per_tx_limit     TEXT NOT NULL DEFAULT '0',
      daily_limit      TEXT NOT NULL DEFAULT '0',
      total_budget     TEXT NOT NULL DEFAULT '0',
      allowlist        TEXT NOT NULL DEFAULT '[]',
      expires_at       INTEGER NOT NULL DEFAULT 0,
      require_allowlist INTEGER NOT NULL DEFAULT 1,
      active           INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS agent_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      spent_today TEXT NOT NULL DEFAULT '0',
      spent_total TEXT NOT NULL DEFAULT '0',
      day_anchor  INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS agent_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts       INTEGER NOT NULL,
      kind     TEXT NOT NULL,          -- 'proposal' | 'execution'
      to_addr  TEXT,
      amount   TEXT,                   -- base units
      allowed  INTEGER NOT NULL,
      reason   TEXT NOT NULL,
      tx_hash  TEXT
    );
  `);
}

export interface StoredPolicy extends AgentPolicy { active: boolean }

export function getPolicy(): StoredPolicy | null {
  ensureTables();
  const row = getDb().getFirstSync<{
    per_tx_limit: string; daily_limit: string; total_budget: string;
    allowlist: string; expires_at: number; require_allowlist: number; active: number;
  }>('SELECT * FROM agent_policy WHERE id = 1');
  if (!row || row.active !== 1) return null;
  return {
    perTxLimit: BigInt(row.per_tx_limit),
    dailyLimit: BigInt(row.daily_limit),
    totalBudget: BigInt(row.total_budget),
    allowlist: JSON.parse(row.allowlist) as string[],
    expiresAt: row.expires_at,
    requireAllowlist: row.require_allowlist === 1,
    active: true,
  };
}

export function setPolicy(policy: AgentPolicy): void {
  ensureTables();
  const now = Math.floor(Date.now() / 1000);
  getDb().runSync(
    `INSERT OR REPLACE INTO agent_policy
       (id, per_tx_limit, daily_limit, total_budget, allowlist, expires_at, require_allowlist, active)
     VALUES (1, ?, ?, ?, ?, ?, ?, 1)`,
    [
      policy.perTxLimit.toString(), policy.dailyLimit.toString(), policy.totalBudget.toString(),
      JSON.stringify(policy.allowlist.map((a) => a.toLowerCase())),
      policy.expiresAt, policy.requireAllowlist ? 1 : 0,
    ],
  );
  // Fresh mandate → fresh state.
  setState(initialState(now));
}

export function revokePolicy(): void {
  ensureTables();
  getDb().runSync('UPDATE agent_policy SET active = 0 WHERE id = 1');
}

export function getState(): AgentState {
  ensureTables();
  const row = getDb().getFirstSync<{ spent_today: string; spent_total: string; day_anchor: number }>(
    'SELECT * FROM agent_state WHERE id = 1',
  );
  if (!row) {
    const s = initialState(Math.floor(Date.now() / 1000));
    setState(s);
    return s;
  }
  return {
    spentToday: BigInt(row.spent_today),
    spentTotal: BigInt(row.spent_total),
    dayAnchor: row.day_anchor,
  };
}

export function setState(state: AgentState): void {
  ensureTables();
  getDb().runSync(
    'INSERT OR REPLACE INTO agent_state (id, spent_today, spent_total, day_anchor) VALUES (1, ?, ?, ?)',
    [state.spentToday.toString(), state.spentTotal.toString(), state.dayAnchor],
  );
}

export interface AuditEntry {
  id: number; ts: number; kind: string; to_addr: string | null;
  amount: string | null; allowed: number; reason: string; tx_hash: string | null;
}

export function logAudit(e: {
  kind: 'proposal' | 'execution'; to?: string; amount?: bigint;
  allowed: boolean; reason: string; txHash?: string;
}): void {
  ensureTables();
  getDb().runSync(
    'INSERT INTO agent_audit (ts, kind, to_addr, amount, allowed, reason, tx_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      Math.floor(Date.now() / 1000), e.kind, e.to ?? null,
      e.amount?.toString() ?? null, e.allowed ? 1 : 0, e.reason, e.txHash ?? null,
    ],
  );
}

export function getAuditLog(limit = 50): AuditEntry[] {
  ensureTables();
  return getDb().getAllSync<AuditEntry>(
    'SELECT * FROM agent_audit ORDER BY id DESC LIMIT ?',
    [limit],
  );
}

/**
 * Evaluate a proposed agent payment against the active mandate, persist the
 * decision to the audit log, and (if allowed) advance + save the spend state.
 * This is the single gate every agent payment must pass before execution.
 */
export function evaluateAndRecord(to: string, amount: bigint): SpendDecision & { active: boolean } {
  const policy = getPolicy();
  if (!policy) {
    logAudit({ kind: 'proposal', to, amount, allowed: false, reason: 'No active agent mandate' });
    return { allowed: false, reason: 'No active agent mandate', nextState: getState(), active: false };
  }
  const now = Math.floor(Date.now() / 1000);
  const decision = evaluateSpend(policy, getState(), { to, amount, now });
  setState(decision.nextState); // persist day-roll even on denial
  logAudit({ kind: 'proposal', to, amount, allowed: decision.allowed, reason: decision.reason });
  return { ...decision, active: true };
}
