import Anthropic from '@anthropic-ai/sdk';

// The agent's brain — "chat with your wallet."
//
// Natural language goes in; STRUCTURED PROPOSALS come out. The model can only
// propose: every payment or mandate is a typed tool call that the UI shows to
// the user for approval, and execution happens locally through the same
// mandate-gated executor as everything else. The brain runs online only; the
// executor it feeds runs offline. Keys never touch this file.
//
// Demo posture: the API key ships in-app via EXPO_PUBLIC (fine for a testnet
// beta). Production would proxy this call through a tiny server so the key
// stays server-side — the interface below wouldn't change.

const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';
const MODEL = process.env.EXPO_PUBLIC_BRAIN_MODEL ?? 'claude-opus-4-8';

export function isBrainConfigured(): boolean {
  return API_KEY.startsWith('sk-ant-');
}

export interface WalletContext {
  address: string;
  balanceUsdc: string;
  contacts: { name: string; address: string }[];
  mandate: {
    perTxUsdc: string;
    dailyLeftUsdc: string;
    totalLeftUsdc: string;
    expiresAt: number; // unix seconds, 0 = never
    allowlistCount: number;
  } | null;
}

export type Proposal =
  | {
      id: string;
      kind: 'payment';
      to: string;
      amountUsdc: string;
      cadence: 'once' | 'daily' | 'weekly' | 'monthly';
      label: string;
    }
  | {
      id: string;
      kind: 'mandate';
      perTxUsdc: string;
      dailyUsdc: string;
      totalUsdc: string;
      expiresDays: number;
      allowlist: string[];
    };

export interface BrainTurn {
  reply: string;
  proposals: Proposal[];
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'propose_payment',
    description:
      'Propose a USDC payment (one-time or recurring standing payment). Call this when the user asks to pay, send, or schedule money. The user must approve before anything is signed. Resolve contact names to their 0x address from the wallet context; if the recipient is unknown, ask instead of guessing.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient 0x address (resolved from contacts or provided by the user)' },
        amount_usdc: { type: 'string', description: 'Amount in USDC as a decimal string, e.g. "2.50"' },
        cadence: { type: 'string', enum: ['once', 'daily', 'weekly', 'monthly'], description: 'How often it repeats' },
        label: { type: 'string', description: 'Short human label, e.g. "Amina — market restock"' },
      },
      required: ['to', 'amount_usdc', 'cadence', 'label'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_mandate',
    description:
      'Propose a spending mandate (the hard envelope the agent can never exceed: per-transaction, daily, and total caps). Call this when the user wants to set, change, or cap what the agent may spend — or before proposing payments when no mandate is active. The user must approve it.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        per_tx_usdc: { type: 'string', description: 'Max USDC per single payment' },
        daily_usdc: { type: 'string', description: 'Max USDC per rolling 24h' },
        total_usdc: { type: 'string', description: 'Lifetime budget for this mandate' },
        expires_days: { type: 'integer', description: 'Days until the mandate expires; 0 = never' },
        allowlist: {
          type: 'array', items: { type: 'string' },
          description: 'Optional list of 0x addresses the agent may pay. Empty = any recipient.',
        },
      },
      required: ['per_tx_usdc', 'daily_usdc', 'total_usdc', 'expires_days', 'allowlist'],
      additionalProperties: false,
    },
  },
];

function systemPrompt(ctx: WalletContext): string {
  const contacts = ctx.contacts.length
    ? ctx.contacts.map((c) => `- ${c.name}: ${c.address}`).join('\n')
    : '(none saved)';
  const mandate = ctx.mandate
    ? `ACTIVE — per-tx cap ${ctx.mandate.perTxUsdc} USDC, ${ctx.mandate.dailyLeftUsdc} left today, ${ctx.mandate.totalLeftUsdc} left total, ` +
      `${ctx.mandate.allowlistCount ? `${ctx.mandate.allowlistCount} allowlisted recipients` : 'any recipient'}, ` +
      `expires ${ctx.mandate.expiresAt ? new Date(ctx.mandate.expiresAt * 1000).toDateString() : 'never'}`
    : 'NONE — the agent cannot spend anything until the user approves a mandate';

  return `You are the Wayamesh wallet agent — a payments assistant living inside a self-custody USDC wallet on the Arc blockchain (testnet). Wayamesh is offline-first: payments the user approves are executed by an on-device engine that signs offline and settles on Arc when connectivity returns.

Hard rules:
- You NEVER move money. You only PROPOSE via tools; the user approves every proposal, and hard mandate limits are enforced by deterministic code you cannot override.
- Never invent addresses. Use the contact list or an 0x address the user gave. If a recipient is unknown, ask.
- If no mandate is active and the user wants payments, propose a sensible mandate first (or together with the payment).
- Amounts are testnet USDC. Keep replies to one or two short sentences — this is a phone chat. No emoji.

Wallet context:
- Address: ${ctx.address}
- Balance: ${ctx.balanceUsdc} USDC
- Contacts:\n${contacts}
- Mandate: ${mandate}
- Mesh: recipients' agents auto-tip couriers 0.05 USDC (mandate-gated) when a payment is hand-delivered over the mesh.`;
}

/**
 * One conversation with the wallet brain. Multi-turn tool_use/tool_result:
 * send() surfaces proposals; the UI executes approved ones locally, then
 * resolve() reports each outcome back so the model can confirm in words.
 */
export class BrainSession {
  private client: Anthropic;
  private messages: Anthropic.MessageParam[] = [];
  private system: string;

  constructor(ctx: WalletContext) {
    this.client = new Anthropic({
      apiKey: API_KEY,
      // Key lives on-device by design for the testnet demo (see header note).
      dangerouslyAllowBrowser: true,
    });
    this.system = systemPrompt(ctx);
  }

  async send(text: string): Promise<BrainTurn> {
    this.messages.push({ role: 'user', content: text });
    return this.request();
  }

  /** Report the user's decision + local execution result for each proposal. */
  async resolve(outcomes: { id: string; outcome: string }[]): Promise<BrainTurn> {
    this.messages.push({
      role: 'user',
      content: outcomes.map((o) => ({
        type: 'tool_result' as const,
        tool_use_id: o.id,
        content: o.outcome,
      })),
    });
    return this.request();
  }

  private async request(): Promise<BrainTurn> {
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 2048, // deliberately short replies — this is a phone chat
      system: this.system,
      tools: TOOLS,
      messages: this.messages,
    });

    // Keep the full assistant content (incl. tool_use blocks) in history.
    this.messages.push({ role: 'assistant', content: response.content });

    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    const proposals: Proposal[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      if (block.name === 'propose_payment') {
        const i = block.input as { to: string; amount_usdc: string; cadence: 'once' | 'daily' | 'weekly' | 'monthly'; label: string };
        proposals.push({ id: block.id, kind: 'payment', to: i.to, amountUsdc: i.amount_usdc, cadence: i.cadence, label: i.label });
      } else if (block.name === 'propose_mandate') {
        const i = block.input as { per_tx_usdc: string; daily_usdc: string; total_usdc: string; expires_days: number; allowlist: string[] };
        proposals.push({
          id: block.id, kind: 'mandate',
          perTxUsdc: i.per_tx_usdc, dailyUsdc: i.daily_usdc, totalUsdc: i.total_usdc,
          expiresDays: i.expires_days, allowlist: i.allowlist,
        });
      }
    }

    return { reply, proposals };
  }
}
