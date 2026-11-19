import { ethers } from 'ethers';
import { sendPayment } from '@/wallet/pay';
import { getContact, addMessage } from '@/db/chat';
import { evaluateAndRecord, logAudit, getState } from './store';
import {
  getDueInstructions, recordRun, setInstructionStatus, deferInstruction,
  type Instruction,
} from './instructions';

// The offline executor — runs due standing payments through the mandate gate
// and the offline signer. Every path works with zero connectivity:
//   trigger (due) → evaluateAndRecord (local SQLite) → buildOfflineTransfer
//   (local nonce + fixed Arc gas fallback) → queued tx settles on reconnect.
// The LLM never appears here; it can only create instructions while online.

const DAY_SECONDS = 86_400;

// Denials that clear on their own — retry later instead of pausing.
const TRANSIENT_DENIALS = new Set(['Exceeds daily limit']);

export type RunOutcome = 'paid' | 'deferred' | 'paused' | 'failed';

export interface ExecutionResult {
  instruction: Instruction;
  outcome: RunOutcome;
  detail: string;
  txHash?: string;
}

export function countDue(now = Math.floor(Date.now() / 1000)): number {
  return getDueInstructions(now).length;
}

/**
 * Execute every due standing payment. Each one passes the mandate gate first;
 * allowed payments are signed offline and queued for settlement. Denied ones
 * are deferred (transient, e.g. daily limit) or paused with the reason shown
 * to the user (permanent, e.g. allowlist / expiry / budget).
 */
export async function runDueInstructions(wallet: ethers.Wallet): Promise<ExecutionResult[]> {
  const now = Math.floor(Date.now() / 1000);
  const results: ExecutionResult[] = [];

  for (const ins of getDueInstructions(now)) {
    const amount = BigInt(ins.amount);
    // Per-schedule end date and total cap (the web wallet autopilot parity). A blocked schedule is paused and logged, never silently skipped.
    if (ins.until_at > 0 && now > ins.until_at) {
      setInstructionStatus(ins.id, 'done', 'Reached its end date');
      logAudit({ kind: 'execution', to: ins.to_addr, amount, allowed: false, reason: `Standing payment ended: ${ins.label}` });
      results.push({ instruction: ins, outcome: 'paused', detail: 'Reached its end date' });
      continue;
    }
    if (BigInt(ins.max_total || '0') > 0n && BigInt(ins.total_paid || '0') + amount > BigInt(ins.max_total)) {
      setInstructionStatus(ins.id, 'paused', 'Total cap reached');
      logAudit({ kind: 'execution', to: ins.to_addr, amount, allowed: false, reason: `Total cap reached: ${ins.label}` });
      results.push({ instruction: ins, outcome: 'paused', detail: 'Total cap reached' });
      continue;
    }
    const decision = evaluateAndRecord(ins.to_addr, amount);

    if (!decision.allowed) {
      if (TRANSIENT_DENIALS.has(decision.reason)) {
        // Retry once the rolling 24h window rolls over.
        const retryAt = Math.max(getState().dayAnchor + DAY_SECONDS, now + 3600);
        deferInstruction(ins.id, retryAt);
        results.push({ instruction: ins, outcome: 'deferred', detail: decision.reason });
      } else {
        setInstructionStatus(ins.id, 'paused', decision.reason);
        results.push({ instruction: ins, outcome: 'paused', detail: decision.reason });
      }
      continue;
    }

    try {
      const tx = await sendPayment(wallet, ins.to_addr, ethers.formatUnits(amount, 6));
      recordRun(ins.id, tx.hash, now);
      logAudit({
        kind: 'execution', to: ins.to_addr, amount,
        allowed: true, reason: `Standing payment: ${ins.label}`, txHash: tx.hash,
      });
      // Mirror into the chat thread when the payee is a contact.
      if (getContact(ins.to_addr)) {
        addMessage({
          peer: ins.to_addr, direction: 'out', kind: 'payment',
          amount: ethers.formatUnits(amount, 6), txHash: tx.hash, status: 'pending',
        });
      }
      results.push({
        instruction: ins, outcome: 'paid', txHash: tx.hash,
        detail: 'Signed offline — settles on reconnect',
      });
    } catch (e) {
      // Mandate state already counted this spend (conservative: fails safe). A PaymentBlocked here means the manual
      // per-payment/daily limits, an unsafe recipient or a missing reserve stopped it: the schedule is paused and logged.
      const msg = e instanceof Error ? e.message : 'Signing failed';
      logAudit({ kind: 'execution', to: ins.to_addr, amount, allowed: false, reason: msg });
      setInstructionStatus(ins.id, 'paused', msg);
      results.push({ instruction: ins, outcome: 'failed', detail: msg });
    }
  }

  return results;
}
