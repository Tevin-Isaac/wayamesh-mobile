// Agent spending-policy engine — the safety core of the autonomous agent wallet.
//
// An AI may *propose* a payment, but this engine *decides* whether it's allowed,
// enforcing hard limits the model cannot override. It is pure and deterministic:
// no network, no AI, no randomness — so it can be unit-tested exhaustively and
// audited line by line. Amounts are USDC base units (integers, 6dp), never floats.

export interface AgentPolicy {
  /** Max for a single payment (base units). */
  perTxLimit: bigint;
  /** Max total across a rolling 24h window (base units). */
  dailyLimit: bigint;
  /** Lifetime budget for this agent mandate (base units). */
  totalBudget: bigint;
  /** If non-empty, the agent may ONLY pay these addresses (lowercased). */
  allowlist: string[];
  /** Unix seconds after which the mandate is void. 0 = no expiry. */
  expiresAt: number;
  /** If true, an empty allowlist means "pay nobody" (deny-by-default). */
  requireAllowlist: boolean;
}

export interface AgentState {
  /** Spent in the current rolling day window (base units). */
  spentToday: bigint;
  /** Spent over the agent's lifetime (base units). */
  spentTotal: bigint;
  /** Unix seconds marking the start of the current day window. */
  dayAnchor: number;
}

export interface SpendRequest {
  to: string;
  amount: bigint; // base units
  now: number;    // unix seconds
}

export interface SpendDecision {
  allowed: boolean;
  reason: string;
  nextState: AgentState;
}

const DAY_SECONDS = 86_400;

export function initialState(now: number): AgentState {
  return { spentToday: 0n, spentTotal: 0n, dayAnchor: now };
}

/**
 * Decide whether the agent may make this payment. Rolls the daily window forward
 * if 24h have elapsed. Returns the decision and the state to persist if allowed
 * (on denial, state is returned unchanged except for any day-window roll).
 */
export function evaluateSpend(
  policy: AgentPolicy,
  state: AgentState,
  req: SpendRequest,
): SpendDecision {
  // Roll the daily window if the previous one has elapsed.
  let rolled: AgentState = state;
  if (req.now - state.dayAnchor >= DAY_SECONDS) {
    rolled = { ...state, spentToday: 0n, dayAnchor: req.now };
  }

  const deny = (reason: string): SpendDecision => ({ allowed: false, reason, nextState: rolled });

  if (policy.expiresAt !== 0 && req.now >= policy.expiresAt) {
    return deny('Agent mandate has expired');
  }
  if (req.amount <= 0n) {
    return deny('Amount must be positive');
  }
  if (req.amount > policy.perTxLimit) {
    return deny('Exceeds per-transaction limit');
  }

  const to = req.to.toLowerCase();
  const allowlist = policy.allowlist.map((a) => a.toLowerCase());
  if (allowlist.length > 0) {
    if (!allowlist.includes(to)) return deny('Recipient not on allowlist');
  } else if (policy.requireAllowlist) {
    return deny('Allowlist required but empty — agent may pay nobody');
  }

  if (rolled.spentToday + req.amount > policy.dailyLimit) {
    return deny('Exceeds daily limit');
  }
  if (rolled.spentTotal + req.amount > policy.totalBudget) {
    return deny('Exceeds total budget');
  }

  return {
    allowed: true,
    reason: 'OK',
    nextState: {
      spentToday: rolled.spentToday + req.amount,
      spentTotal: rolled.spentTotal + req.amount,
      dayAnchor: rolled.dayAnchor,
    },
  };
}

/** Remaining headroom under each limit, for display / agent self-awareness. */
export function remaining(policy: AgentPolicy, state: AgentState, now: number) {
  const dayActive = now - state.dayAnchor < DAY_SECONDS;
  const spentToday = dayActive ? state.spentToday : 0n;
  const clamp = (x: bigint) => (x < 0n ? 0n : x);
  return {
    perTx: policy.perTxLimit,
    today: clamp(policy.dailyLimit - spentToday),
    total: clamp(policy.totalBudget - state.spentTotal),
  };
}
