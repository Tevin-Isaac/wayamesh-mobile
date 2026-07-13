import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ethers } from 'ethers';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '@/hooks/useWallet';
import { BrainSession, isBrainConfigured, type Proposal, type WalletContext } from '@/agent/brain';
import { getContacts } from '@/db/chat';
import { getPolicy, getState, setPolicy } from '@/agent/store';
import { remaining } from '@/agent/policy';
import { addInstruction } from '@/agent/instructions';
import { COLORS, SPACING, RADIUS, FONTS } from '@/constants/theme';

// "Chat with your wallet" — natural language in, mandate-gated action out.
// The model only proposes; every card below requires a human tap, and the
// offline executor + policy engine do the actual work.

const CADENCE_SECS = { once: 0, daily: 86_400, weekly: 604_800, monthly: 2_592_000 } as const;

type ChatItem =
  | { type: 'text'; role: 'user' | 'agent'; body: string }
  | { type: 'proposal'; proposal: Proposal; status: 'pending' | 'approved' | 'declined' };

export default function AgentChatScreen() {
  const { address, balance } = useWallet();
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const sessionRef = useRef<BrainSession | null>(null);

  const configured = isBrainConfigured();

  const context: WalletContext = useMemo(() => {
    let contacts: WalletContext['contacts'] = [];
    let mandate: WalletContext['mandate'] = null;
    try {
      contacts = getContacts().map((c) => ({ name: c.name, address: c.address }));
      const policy = getPolicy();
      if (policy) {
        const rem = remaining(policy, getState(), Math.floor(Date.now() / 1000));
        mandate = {
          perTxUsdc: ethers.formatUnits(policy.perTxLimit, 6),
          dailyLeftUsdc: ethers.formatUnits(rem.today, 6),
          totalLeftUsdc: ethers.formatUnits(rem.total, 6),
          expiresAt: policy.expiresAt,
          allowlistCount: policy.allowlist.length,
        };
      }
    } catch { /* db not ready */ }
    return {
      address: address ?? '0x0000000000000000000000000000000000000000',
      balanceUsdc: balance ? Number(balance).toFixed(2) : '0.00',
      contacts,
      mandate,
    };
  }, [address, balance]);

  useEffect(() => { scrollRef.current?.scrollToEnd({ animated: true }); }, [items, busy]);

  function session(): BrainSession {
    if (!sessionRef.current) sessionRef.current = new BrainSession(context);
    return sessionRef.current;
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setItems((prev) => [...prev, { type: 'text', role: 'user', body: text }]);
    setBusy(true);
    try {
      const turn = await session().send(text);
      pushTurn(turn.reply, turn.proposals);
    } catch (e) {
      setItems((prev) => [...prev, {
        type: 'text', role: 'agent',
        body: `I couldn't reach the network — the brain needs a connection. (${e instanceof Error ? e.message.slice(0, 80) : 'error'})`,
      }]);
    } finally {
      setBusy(false);
    }
  }

  function pushTurn(reply: string, proposals: Proposal[]) {
    setItems((prev) => [
      ...prev,
      ...(reply ? [{ type: 'text' as const, role: 'agent' as const, body: reply }] : []),
      ...proposals.map((p) => ({ type: 'proposal' as const, proposal: p, status: 'pending' as const })),
    ]);
  }

  async function decide(proposal: Proposal, approved: boolean) {
    if (busy) return;
    let outcome: string;
    if (!approved) {
      outcome = 'Declined by user.';
    } else if (proposal.kind === 'payment') {
      if (!ethers.isAddress(proposal.to)) {
        outcome = 'Rejected: invalid recipient address.';
        approved = false;
      } else {
        addInstruction({
          label: proposal.label || 'Agent payment',
          to: proposal.to,
          amount: ethers.parseUnits(proposal.amountUsdc, 6),
          intervalSeconds: CADENCE_SECS[proposal.cadence],
        });
        outcome = 'Approved. Standing payment created — it executes through the mandate-gated offline engine (user can run due payments from the Agent screen, even offline).';
      }
    } else {
      const bad = proposal.allowlist.find((a) => !ethers.isAddress(a));
      if (bad) {
        outcome = `Rejected: invalid allowlist address ${bad}.`;
        approved = false;
      } else {
        setPolicy({
          perTxLimit: ethers.parseUnits(proposal.perTxUsdc, 6),
          dailyLimit: ethers.parseUnits(proposal.dailyUsdc, 6),
          totalBudget: ethers.parseUnits(proposal.totalUsdc, 6),
          allowlist: proposal.allowlist,
          expiresAt: proposal.expiresDays > 0
            ? Math.floor(Date.now() / 1000) + proposal.expiresDays * 86_400
            : 0,
          requireAllowlist: proposal.allowlist.length > 0,
        });
        outcome = 'Approved. Mandate is now active and enforced on-device.';
      }
    }

    setItems((prev) => prev.map((it) =>
      it.type === 'proposal' && it.proposal.id === proposal.id
        ? { ...it, status: approved ? 'approved' : 'declined' }
        : it,
    ));
    setBusy(true);
    try {
      const turn = await session().resolve([{ id: proposal.id, outcome }]);
      pushTurn(turn.reply, turn.proposals);
    } catch { /* confirmation is cosmetic; the action already happened */ }
    finally { setBusy(false); }
  }

  if (!configured) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.center}>
          <View style={styles.introIcon}><Ionicons name="sparkles-outline" size={22} color={COLORS.accent} /></View>
          <Text style={styles.title}>Brain not configured</Text>
          <Text style={styles.dim}>
            Set EXPO_PUBLIC_ANTHROPIC_API_KEY in .env and rebuild to chat with your wallet.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.thread} keyboardShouldPersistTaps="handled">
          {items.length === 0 && (
            <View style={styles.emptyWrap}>
              <Text style={styles.dim}>
                Tell your wallet what to do — it proposes, you approve, the offline
                engine executes within your mandate.
              </Text>
              {['Pay Amina 2 USDC every Friday', 'Cap my agent at 10 USDC a day', 'What can you do?'].map((s) => (
                <TouchableOpacity key={s} style={styles.suggestion} onPress={() => setInput(s)} activeOpacity={0.7}>
                  <Text style={styles.suggestionText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {items.map((it, i) =>
            it.type === 'text' ? (
              <View key={i} style={[styles.bubble, it.role === 'user' ? styles.bubbleUser : styles.bubbleAgent]}>
                <Text style={[styles.bubbleText, it.role === 'user' && styles.bubbleTextUser]}>{it.body}</Text>
              </View>
            ) : (
              <ProposalCard key={i} item={it} onDecide={decide} busy={busy} />
            ),
          )}

          {busy && <ActivityIndicator color={COLORS.accent} style={{ marginVertical: SPACING.sm }} />}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            style={styles.input} value={input} onChangeText={setInput}
            placeholder="Ask your wallet…" placeholderTextColor={COLORS.textDim}
            multiline editable={!busy}
          />
          <TouchableOpacity onPress={send} style={[styles.sendBtn, (!input.trim() || busy) && styles.sendBtnOff]} disabled={!input.trim() || busy} activeOpacity={0.8}>
            <Ionicons name="arrow-up" size={20} color={COLORS.bg} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ProposalCard({ item, onDecide, busy }: {
  item: { proposal: Proposal; status: 'pending' | 'approved' | 'declined' };
  onDecide: (p: Proposal, approved: boolean) => void;
  busy: boolean;
}) {
  const p = item.proposal;
  const short = (a: string) => (a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);
  return (
    <View style={[styles.card, item.status !== 'pending' && styles.cardDone]}>
      <View style={styles.cardHead}>
        <Ionicons name={p.kind === 'payment' ? 'cash-outline' : 'shield-checkmark-outline'} size={16} color={COLORS.accent} />
        <Text style={styles.cardTitle}>{p.kind === 'payment' ? 'Payment proposal' : 'Mandate proposal'}</Text>
        {item.status !== 'pending' && (
          <Text style={[styles.cardStatus, item.status === 'declined' && { color: COLORS.error }]}>
            {item.status === 'approved' ? 'Approved' : 'Declined'}
          </Text>
        )}
      </View>
      {p.kind === 'payment' ? (
        <>
          <Text style={styles.cardAmount}>${Number(p.amountUsdc).toFixed(2)} <Text style={styles.cardCadence}>· {p.cadence}</Text></Text>
          <Text style={styles.cardMeta}>{p.label}</Text>
          <Text style={styles.cardMono}>to {short(p.to)}</Text>
        </>
      ) : (
        <>
          <Text style={styles.cardMeta}>Per payment {p.perTxUsdc} · Daily {p.dailyUsdc} · Total {p.totalUsdc} USDC</Text>
          <Text style={styles.cardMeta}>
            {p.expiresDays > 0 ? `Expires in ${p.expiresDays} days` : 'No expiry'} · {p.allowlist.length ? `${p.allowlist.length} allowed recipients` : 'any recipient'}
          </Text>
        </>
      )}
      {item.status === 'pending' && (
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.approve} onPress={() => onDecide(p, true)} disabled={busy} activeOpacity={0.85}>
            <Text style={styles.approveText}>Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.decline} onPress={() => onDecide(p, false)} disabled={busy} activeOpacity={0.7}>
            <Text style={styles.declineText}>Decline</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: 10 },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  dim: { fontSize: 13, color: COLORS.textDim, lineHeight: 20, textAlign: 'center' },

  thread: { padding: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  emptyWrap: { gap: 10, marginTop: SPACING.xl, alignItems: 'center' },
  suggestion: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  suggestionText: { fontSize: 13, color: COLORS.textMuted },

  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: COLORS.accent, borderBottomRightRadius: 4 },
  bubbleAgent: { alignSelf: 'flex-start', backgroundColor: COLORS.surfaceAlt, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, color: COLORS.text, lineHeight: 21 },
  bubbleTextUser: { color: COLORS.bg },

  card: {
    alignSelf: 'stretch', backgroundColor: COLORS.surface, borderWidth: 1,
    borderColor: 'rgba(62,217,184,0.35)', borderRadius: RADIUS.lg, padding: SPACING.md, gap: 4,
  },
  cardDone: { opacity: 0.75, borderColor: COLORS.border },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  cardTitle: { flex: 1, fontSize: 12, fontWeight: '700', color: COLORS.accent, textTransform: 'uppercase', letterSpacing: 0.8 },
  cardStatus: { fontSize: 12, fontWeight: '700', color: COLORS.accent },
  cardAmount: { fontFamily: FONTS.mono, fontSize: 24, fontWeight: '700', color: COLORS.text },
  cardCadence: { fontSize: 13, color: COLORS.textMuted, fontWeight: '400' },
  cardMeta: { fontSize: 13, color: COLORS.textMuted },
  cardMono: { fontSize: 12, color: COLORS.textDim, fontFamily: FONTS.mono },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: SPACING.sm },
  approve: {
    flex: 1, backgroundColor: COLORS.accent, borderRadius: RADIUS.md,
    paddingVertical: 12, alignItems: 'center',
  },
  approveText: { color: COLORS.bg, fontWeight: '700', fontSize: 14 },
  decline: {
    flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingVertical: 12, alignItems: 'center',
  },
  declineText: { color: COLORS.textMuted, fontWeight: '600', fontSize: 14 },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  input: {
    flex: 1, maxHeight: 110, minHeight: 42, backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingTop: 10, paddingBottom: 10,
    color: COLORS.text, fontSize: 15,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnOff: { opacity: 0.4 },
  introIcon: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
});
