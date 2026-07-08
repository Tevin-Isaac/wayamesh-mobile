import { getDb } from '@/db/schema';

// Standing payment instructions — the agent's "hands", built to work offline.
//
// While online, a brain (the user today; an AI planner later) creates
// instructions: pay X to Y, once or on a schedule. Offline, the executor
// evaluates due instructions against the mandate and signs. There is no AI
// and no network in the execution path — it is deterministic and auditable.
// Amounts are USDC base units stored as TEXT to preserve bigint precision.

export type InstructionStatus = 'active' | 'paused' | 'done';

export interface Instruction {
  id: number;
  label: string;
  to_addr: string;
  amount: string;           // USDC base units
  interval_seconds: number; // 0 = one-time
  next_run_at: number;      // unix seconds; when the payment is due
  status: InstructionStatus;
  status_reason: string;
  runs_count: number;
  last_run_at: number;
  last_tx_hash: string | null;
  created_at: number;
}

function ensureTable(): void {
  getDb().execSync(`
    CREATE TABLE IF NOT EXISTS agent_instructions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label            TEXT NOT NULL,
      to_addr          TEXT NOT NULL,
      amount           TEXT NOT NULL,
      interval_seconds INTEGER NOT NULL DEFAULT 0,
      next_run_at      INTEGER NOT NULL,
      status           TEXT NOT NULL DEFAULT 'active',
      status_reason    TEXT NOT NULL DEFAULT '',
      runs_count       INTEGER NOT NULL DEFAULT 0,
      last_run_at      INTEGER NOT NULL DEFAULT 0,
      last_tx_hash     TEXT,
      created_at       INTEGER NOT NULL
    );
  `);
}

export function addInstruction(i: {
  label: string;
  to: string;
  amount: bigint;
  intervalSeconds: number;
  firstRunAt?: number;
}): void {
  ensureTable();
  const now = Math.floor(Date.now() / 1000);
  getDb().runSync(
    `INSERT INTO agent_instructions
       (label, to_addr, amount, interval_seconds, next_run_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?)`,
    [i.label, i.to.toLowerCase(), i.amount.toString(), i.intervalSeconds, i.firstRunAt ?? now, now],
  );
}

export function getInstructions(): Instruction[] {
  ensureTable();
  return getDb().getAllSync<Instruction>(
    `SELECT * FROM agent_instructions
     ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, next_run_at ASC`,
  );
}

export function getDueInstructions(now = Math.floor(Date.now() / 1000)): Instruction[] {
  ensureTable();
  return getDb().getAllSync<Instruction>(
    `SELECT * FROM agent_instructions WHERE status = 'active' AND next_run_at <= ? ORDER BY next_run_at ASC`,
    [now],
  );
}

export function setInstructionStatus(id: number, status: InstructionStatus, reason = ''): void {
  ensureTable();
  getDb().runSync(
    'UPDATE agent_instructions SET status = ?, status_reason = ? WHERE id = ?',
    [status, reason, id],
  );
}

/** Push a due instruction's next run into the future without changing status. */
export function deferInstruction(id: number, until: number): void {
  ensureTable();
  getDb().runSync('UPDATE agent_instructions SET next_run_at = ? WHERE id = ?', [until, id]);
}

export function deleteInstruction(id: number): void {
  ensureTable();
  getDb().runSync('DELETE FROM agent_instructions WHERE id = ?', [id]);
}

/** Record a successful execution: bump counters and schedule (or finish). */
export function recordRun(id: number, txHash: string, now = Math.floor(Date.now() / 1000)): void {
  ensureTable();
  const row = getDb().getFirstSync<Instruction>('SELECT * FROM agent_instructions WHERE id = ?', [id]);
  if (!row) return;
  const recurring = row.interval_seconds > 0;
  getDb().runSync(
    `UPDATE agent_instructions
       SET runs_count = runs_count + 1, last_run_at = ?, last_tx_hash = ?,
           next_run_at = ?, status = ?, status_reason = ''
     WHERE id = ?`,
    [now, txHash, recurring ? now + row.interval_seconds : row.next_run_at, recurring ? 'active' : 'done', id],
  );
}
