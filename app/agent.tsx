import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ethers } from 'ethers';
import { Ionicons } from '@expo/vector-icons';
import { remaining } from '@/agent/policy';
import {
  getPolicy, setPolicy, revokePolicy, getState,
  getAuditLog, evaluateAndRecord, type StoredPolicy, type AuditEntry,
} from '@/agent/store';
import {
  getInstructions, addInstruction, setInstructionStatus, deleteInstruction,
  type Instruction,
} from '@/agent/instructions';
import { countDue, runDueInstructions } from '@/agent/executor';
import { getContacts, getContact, type Contact } from '@/db/chat';
import { useWallet } from '@/hooks/useWallet';
import { Avatar, Eyebrow } from '@/components/pro';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { COLORS, SPACING, RADIUS, FONTS } from '@/constants/theme';

const usdc = (units: bigint) => ethers.formatUnits(units, 6);
const toUnits = (s: string) => ethers.parseUnits(s || '0', 6);
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const CADENCES = [
  { key: 'once',    label: 'Once',    secs: 0 },
  { key: 'daily',   label: 'Daily',   secs: 86_400 },
  { key: 'weekly',  label: 'Weekly',  secs: 604_800 },
  { key: 'monthly', label: 'Monthly', secs: 2_592_000 },
] as const;

function cadenceLabel(secs: number): string {
  return CADENCES.find((c) => c.secs === secs)?.label.toLowerCase() ?? `every ${Math.round(secs / 86_400)}d`;
}

// ── Envelope meter ─────────────────────────────────────────────────────────────

function Meter({ label, left, cap }: { label: string; left: bigint; cap: bigint }) {
  const spent = cap - left;
  const pct = cap > 0n ? Math.min(100, Number((spent * 1000n) / cap) / 10) : 0;
  return (
    <View style={styles.meter}>
      <View style={styles.meterHead}>
        <Text style={styles.meterLabel}>{label}</Text>
        <Text style={styles.meterValue}>{usdc(left)} <Text style={styles.meterCap}>of {usdc(cap)}</Text></Text>
      </View>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${100 - pct}%` }]} />
      </View>
    </View>
  );
}

// ── Standing payment row ───────────────────────────────────────────────────────

function InstructionRow({ ins, onToggle, onDelete }: {
  ins: Instruction; onToggle: () => void; onDelete: () => void;
}) {
  const name = getContact(ins.to_addr)?.name ?? shortAddr(ins.to_addr);
  const nextDate = new Date(ins.next_run_at * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const sub =
    ins.status === 'paused' ? `Paused — ${ins.status_reason || 'by you'}`
    : ins.status === 'done' ? `Completed · ${ins.runs_count} run${ins.runs_count === 1 ? '' : 's'}`
    : `Next ${nextDate}${ins.runs_count > 0 ? ` · ${ins.runs_count} paid` : ''}`;
  const subColor =
    ins.status === 'paused' ? COLORS.warning
    : ins.status === 'done' ? COLORS.textDim
    : COLORS.accent;

  return (
    <View style={styles.insRow}>
      <Avatar seed={ins.to_addr} size={40} />
      <View style={styles.insBody}>
        <Text style={styles.insLabel} numberOfLines={1}>{ins.label}</Text>
        <Text style={styles.insWho} numberOfLines={1}>{name} · {cadenceLabel(ins.interval_seconds)}</Text>
        <Text style={[styles.insSub, { color: subColor }]} numberOfLines={1}>{sub}</Text>
      </View>
      <Text style={styles.insAmt}>{usdc(BigInt(ins.amount))}</Text>
      {ins.status !== 'done' && (
        <TouchableOpacity onPress={onToggle} hitSlop={8} activeOpacity={0.7}>
          <Ionicons
            name={ins.status === 'active' ? 'pause-circle-outline' : 'play-circle-outline'}
            size={22} color={COLORS.textMuted}
          />
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onDelete} hitSlop={8} activeOpacity={0.7}>
        <Ionicons name="trash-outline" size={19} color={COLORS.textDim} />
      </TouchableOpacity>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function AgentScreen() {
  const { unlock } = useWallet();

  const [policy, setPolicyState] = useState<StoredPolicy | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [due, setDue] = useState(0);
  const [running, setRunning] = useState(false);

  // Mandate grant form
  const [perTx, setPerTx] = useState('5');
  const [daily, setDaily] = useState('20');
  const [total, setTotal] = useState('100');
  const [allow, setAllow] = useState('');
  const [days, setDays]   = useState('7');

  // New standing payment form
  const [showForm, setShowForm] = useState(false);
  const [payLabel, setPayLabel] = useState('');
  const [payTo, setPayTo]       = useState('');
  const [payAmt, setPayAmt]     = useState('');
  const [cadence, setCadence]   = useState<(typeof CADENCES)[number]['key']>('once');
  const [contacts, setContacts] = useState<Contact[]>([]);

  // Guardrail test form
  const [testTo, setTestTo]         = useState('');
  const [testAmount, setTestAmount] = useState('');

  const refresh = useCallback(() => {
    setPolicyState(getPolicy());
    setAudit(getAuditLog(20));
    setInstructions(getInstructions());
    setDue(countDue());
    try { setContacts(getContacts()); } catch { /* DB not ready */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  function grant() {
    try {
      const addresses = allow.split(/[\s,]+/).map((a) => a.trim()).filter(Boolean);
      for (const a of addresses) {
        if (!ethers.isAddress(a)) throw new Error(`Invalid address: ${a}`);
      }
      const expiresAt = Number(days) > 0
        ? Math.floor(Date.now() / 1000) + Number(days) * 86_400
        : 0;
      setPolicy({
        perTxLimit: toUnits(perTx),
        dailyLimit: toUnits(daily),
        totalBudget: toUnits(total),
        allowlist: addresses,
        expiresAt,
        requireAllowlist: addresses.length > 0,
      });
      refresh();
      Alert.alert('Mandate granted', 'The agent may now spend within these limits — even offline.');
    } catch (e) {
      Alert.alert('Invalid mandate', e instanceof Error ? e.message : 'Check your inputs');
    }
  }

  function revoke() {
    Alert.alert('Revoke mandate', 'The agent will be unable to spend until you grant a new mandate. Standing payments stay but will not run.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Revoke', style: 'destructive', onPress: () => { revokePolicy(); refresh(); } },
    ]);
  }

  function createInstruction() {
    if (!ethers.isAddress(payTo)) { Alert.alert('Invalid recipient', 'Enter a valid 0x address or pick a contact.'); return; }
    let amount: bigint;
    try { amount = toUnits(payAmt); } catch { Alert.alert('Invalid amount', 'Enter a USDC amount.'); return; }
    if (amount <= 0n) { Alert.alert('Invalid amount', 'Amount must be positive.'); return; }
    if (policy && policy.allowlist.length > 0 && !policy.allowlist.includes(payTo.toLowerCase())) {
      Alert.alert('Not on allowlist', 'This recipient is not on the mandate allowlist, so the payment would be denied. Add them to the mandate first.');
      return;
    }
    const label = payLabel.trim() || getContact(payTo.toLowerCase())?.name || 'Standing payment';
    const secs = CADENCES.find((c) => c.key === cadence)!.secs;
    addInstruction({ label, to: payTo, amount, intervalSeconds: secs });
    setPayLabel(''); setPayTo(''); setPayAmt(''); setCadence('once'); setShowForm(false);
    refresh();
  }

  async function runNow() {
    setRunning(true);
    try {
      const wallet = await unlock();
      if (!wallet) return;
      const results = await runDueInstructions(wallet);
      refresh();
      if (results.length === 0) { Alert.alert('Nothing due', 'No standing payments are due right now.'); return; }
      const paid = results.filter((r) => r.outcome === 'paid').length;
      const lines = results.map((r) =>
        `${r.instruction.label}: ${r.outcome === 'paid' ? `${usdc(BigInt(r.instruction.amount))} USDC signed` : r.detail}`);
      Alert.alert(
        paid > 0 ? `${paid} payment${paid === 1 ? '' : 's'} signed` : 'No payments made',
        lines.join('\n') + (paid > 0 ? '\n\nQueued transactions settle on Arc when you reconnect.' : ''),
      );
    } finally {
      setRunning(false);
    }
  }

  function testProposal() {
    if (!ethers.isAddress(testTo)) { Alert.alert('Invalid', 'Enter a valid recipient address'); return; }
    const d = evaluateAndRecord(testTo, toUnits(testAmount));
    refresh();
    Alert.alert(
      d.allowed ? 'Would be ALLOWED' : 'Would be DENIED',
      d.reason + (d.allowed ? '\n\n(No funds moved — this is a guardrail test.)' : ''),
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const rem = policy ? remaining(policy, getState(), now) : null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* chat with your wallet */}
          <TouchableOpacity style={styles.askCard} onPress={() => router.push('/agent-chat')} activeOpacity={0.85}>
            <View style={styles.askIcon}><Ionicons name="sparkles" size={18} color={COLORS.bg} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.askTitle}>Ask your wallet</Text>
              <Text style={styles.askSub}>"Pay Amina 2 USDC every Friday" — it proposes, you approve</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textDim} />
          </TouchableOpacity>

          {policy && rem ? (
            <>
              {/* spending envelope */}
              <View style={styles.envelope}>
                <View style={styles.envelopeGlow} pointerEvents="none" />
                <View style={styles.envelopeHead}>
                  <Eyebrow>Spending envelope</Eyebrow>
                  <View style={styles.livePill}>
                    <View style={styles.liveDot} />
                    <Text style={styles.livePillText}>
                      {policy.expiresAt ? `to ${new Date(policy.expiresAt * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'No expiry'}
                    </Text>
                  </View>
                </View>
                <Meter label="Today" left={rem.today} cap={policy.dailyLimit} />
                <Meter label="Total budget" left={rem.total} cap={policy.totalBudget} />
                <View style={styles.envelopeFoot}>
                  <Text style={styles.envelopeFootText}>
                    Max {usdc(policy.perTxLimit)} per payment · {policy.allowlist.length ? `${policy.allowlist.length} allowed recipient${policy.allowlist.length === 1 ? '' : 's'}` : 'any recipient'}
                  </Text>
                  <TouchableOpacity onPress={revoke} hitSlop={8} activeOpacity={0.7}>
                    <Text style={styles.revokeLink}>Revoke</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* due banner */}
              {due > 0 && (
                <TouchableOpacity style={styles.dueBanner} onPress={runNow} disabled={running} activeOpacity={0.85}>
                  <View style={styles.dueIcon}>
                    {running
                      ? <ActivityIndicator color={COLORS.accent} size="small" />
                      : <Ionicons name="flash" size={18} color={COLORS.accent} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dueTitle}>{due} standing payment{due === 1 ? '' : 's'} due</Text>
                    <Text style={styles.dueSub}>Signs offline · settles when you reconnect</Text>
                  </View>
                  <Text style={styles.dueAction}>{running ? 'Running…' : 'Run now'}</Text>
                </TouchableOpacity>
              )}

              {/* standing payments */}
              <View style={styles.sectionHead}>
                <Eyebrow>Standing payments</Eyebrow>
                <TouchableOpacity onPress={() => setShowForm((s) => !s)} hitSlop={8} activeOpacity={0.7}>
                  <Ionicons name={showForm ? 'close' : 'add'} size={20} color={COLORS.accent} />
                </TouchableOpacity>
              </View>

              {showForm && (
                <View style={styles.form}>
                  {contacts.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                      {contacts.map((c) => (
                        <TouchableOpacity
                          key={c.address} activeOpacity={0.7}
                          style={[styles.chip, payTo.toLowerCase() === c.address && styles.chipOn]}
                          onPress={() => { setPayTo(c.address); if (!payLabel) setPayLabel(c.name); }}
                        >
                          <Text style={[styles.chipText, payTo.toLowerCase() === c.address && styles.chipTextOn]}>{c.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                  <Input label="Recipient" value={payTo} onChangeText={setPayTo} placeholder="0x…" autoCapitalize="none" autoCorrect={false} mono containerStyle={styles.field} />
                  <Input label="Amount (USDC)" value={payAmt} onChangeText={setPayAmt} keyboardType="decimal-pad" containerStyle={styles.field} />
                  <Input label="Label (optional)" value={payLabel} onChangeText={setPayLabel} placeholder="e.g. Supplier restock" containerStyle={styles.field} />
                  <View style={styles.cadenceRow}>
                    {CADENCES.map((c) => (
                      <TouchableOpacity
                        key={c.key} activeOpacity={0.7}
                        style={[styles.chip, cadence === c.key && styles.chipOn]}
                        onPress={() => setCadence(c.key)}
                      >
                        <Text style={[styles.chipText, cadence === c.key && styles.chipTextOn]}>{c.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Button title="Create standing payment" onPress={createInstruction} style={styles.field} />
                  <Text style={styles.hint}>First run is due immediately — tap “Run now” to execute, even with no connection.</Text>
                </View>
              )}

              {instructions.length === 0 && !showForm ? (
                <Text style={styles.empty}>
                  No standing payments yet. Tap + to create one — the agent executes it
                  within your envelope, online or off.
                </Text>
              ) : (
                instructions.map((ins) => (
                  <InstructionRow
                    key={ins.id}
                    ins={ins}
                    onToggle={() => {
                      setInstructionStatus(ins.id, ins.status === 'active' ? 'paused' : 'active', ins.status === 'active' ? 'by you' : '');
                      refresh();
                    }}
                    onDelete={() => {
                      Alert.alert('Delete standing payment', `Remove “${ins.label}”?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => { deleteInstruction(ins.id); refresh(); } },
                      ]);
                    }}
                  />
                ))
              )}

              {/* guardrail test */}
              <Eyebrow style={styles.section}>Test the guardrails</Eyebrow>
              <Text style={styles.hint}>Dry-run a proposal — no funds move.</Text>
              <Input label="Recipient" value={testTo} onChangeText={setTestTo} placeholder="0x…" autoCapitalize="none" autoCorrect={false} mono containerStyle={styles.field} />
              <Input label="Amount (USDC)" value={testAmount} onChangeText={setTestAmount} keyboardType="decimal-pad" containerStyle={styles.field} />
              <Button title="Test Proposal" variant="secondary" onPress={testProposal} style={styles.field} />
            </>
          ) : (
            <>
              <View style={styles.introCard}>
                <View style={styles.introIcon}><Ionicons name="sparkles-outline" size={20} color={COLORS.accent} /></View>
                <Text style={styles.intro}>
                  Give the agent a spending envelope: hard limits it can never exceed,
                  enforced on this device. Inside it, standing payments run by
                  themselves — even offline. Revoke any time.
                </Text>
              </View>

              <Eyebrow style={styles.section}>New mandate</Eyebrow>
              <Input label="Per-transaction limit (USDC)" value={perTx} onChangeText={setPerTx} keyboardType="decimal-pad" containerStyle={styles.field} />
              <Input label="Daily limit (USDC)" value={daily} onChangeText={setDaily} keyboardType="decimal-pad" containerStyle={styles.field} />
              <Input label="Total budget (USDC)" value={total} onChangeText={setTotal} keyboardType="decimal-pad" containerStyle={styles.field} />
              <Input label="Expires in (days, 0 = never)" value={days} onChangeText={setDays} keyboardType="number-pad" containerStyle={styles.field} />
              <Input
                label="Allowed recipients (optional, comma/space separated)"
                value={allow} onChangeText={setAllow}
                placeholder="0x… 0x…" autoCapitalize="none" autoCorrect={false} mono multiline
                containerStyle={styles.field} style={styles.textarea}
              />
              <Text style={styles.hint}>
                Leave recipients empty to allow any address (not recommended). With
                recipients listed, the agent may pay only those.
              </Text>
              <Button title="Grant Mandate" onPress={grant} style={styles.field} />
            </>
          )}

          {audit.length > 0 && (
            <>
              <Eyebrow style={styles.section}>Audit log</Eyebrow>
              {audit.map((a) => (
                <View key={a.id} style={styles.auditRow}>
                  <Ionicons
                    name={a.kind === 'execution' && a.allowed ? 'flash' : a.allowed ? 'checkmark-circle-outline' : 'close-circle-outline'}
                    size={16}
                    color={a.allowed ? COLORS.accent : COLORS.error}
                  />
                  <View style={styles.auditBody}>
                    <Text style={styles.auditMain}>
                      {a.amount ? `${usdc(BigInt(a.amount))} USDC` : '—'}
                      {a.to_addr ? ` → ${a.to_addr.slice(0, 8)}…` : ''}
                    </Text>
                    <Text style={styles.auditReason}>{a.reason}</Text>
                  </View>
                  <Text style={styles.auditTime}>{new Date(a.ts * 1000).toLocaleTimeString()}</Text>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  kav:       { flex: 1 },
  content:   { padding: SPACING.lg, paddingBottom: SPACING.xxl },

  askCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: 'rgba(62,217,184,0.4)',
    borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md,
    shadowColor: COLORS.accent, shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  askIcon: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  askTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  askSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },

  // envelope
  envelope: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, padding: SPACING.md, overflow: 'hidden', marginBottom: SPACING.md,
  },
  envelopeGlow: {
    position: 'absolute', top: -60, right: -40, width: 180, height: 180,
    borderRadius: 90, backgroundColor: COLORS.accent, opacity: 0.07,
  },
  envelopeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceAlt,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accent },
  livePillText: { fontSize: 11, color: COLORS.textMuted },
  envelopeFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.sm },
  envelopeFootText: { fontSize: 11, color: COLORS.textDim, flex: 1 },
  revokeLink: { fontSize: 12, color: COLORS.error, fontWeight: '600' },

  meter: { marginBottom: SPACING.sm },
  meterHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 },
  meterLabel: { fontSize: 12, color: COLORS.textMuted },
  meterValue: { fontFamily: FONTS.mono, fontSize: 13, color: COLORS.text, fontWeight: '700' },
  meterCap: { color: COLORS.textDim, fontWeight: '400', fontSize: 11 },
  meterTrack: { height: 6, borderRadius: 3, backgroundColor: COLORS.surfaceAlt, overflow: 'hidden' },
  meterFill: { height: 6, borderRadius: 3, backgroundColor: COLORS.accent },

  // due banner
  dueBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.accentSoft, borderWidth: 1, borderColor: 'rgba(62,217,184,0.3)',
    borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md,
  },
  dueIcon: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: COLORS.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  dueTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  dueSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  dueAction: { fontSize: 13, fontWeight: '700', color: COLORS.accent },

  // sections
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.sm, marginBottom: SPACING.sm },
  section: { marginTop: SPACING.lg, marginBottom: SPACING.sm },

  // standing payment rows
  insRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  insBody: { flex: 1, minWidth: 0 },
  insLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  insWho: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  insSub: { fontSize: 11, fontFamily: FONTS.mono, marginTop: 2 },
  insAmt: { fontFamily: FONTS.mono, fontSize: 15, fontWeight: '700', color: COLORS.text },

  empty: { fontSize: 13, color: COLORS.textDim, lineHeight: 20, paddingVertical: SPACING.sm },

  // create form
  form: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md,
  },
  chips: { gap: 8, paddingBottom: 4 },
  cadenceRow: { flexDirection: 'row', gap: 8, marginTop: SPACING.md },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceAlt,
  },
  chipOn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chipText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500' },
  chipTextOn: { color: COLORS.bg, fontWeight: '700' },

  // intro (no mandate)
  introCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm,
  },
  introIcon: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: COLORS.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  intro: { flex: 1, fontSize: 13, color: COLORS.textMuted, lineHeight: 20 },

  field:    { marginTop: SPACING.sm },
  textarea: { minHeight: 70, textAlignVertical: 'top', paddingTop: SPACING.sm },
  hint:     { fontSize: 12, color: COLORS.textDim, lineHeight: 18, marginTop: SPACING.xs },

  // audit
  auditRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  auditBody: { flex: 1 },
  auditMain: { fontSize: 13, color: COLORS.text, fontFamily: FONTS.mono },
  auditReason: { fontSize: 11, color: COLORS.textDim },
  auditTime: { fontSize: 10, color: COLORS.textDim },
});
