import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ethers } from 'ethers';
import { Ionicons } from '@expo/vector-icons';
import { remaining } from '@/agent/policy';
import {
  getPolicy, setPolicy, revokePolicy, getState,
  getAuditLog, evaluateAndRecord, type StoredPolicy, type AuditEntry,
} from '@/agent/store';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { COLORS, SPACING } from '@/constants/theme';

const usdc = (units: bigint) => ethers.formatUnits(units, 6);
const toUnits = (s: string) => ethers.parseUnits(s || '0', 6);

export default function AgentScreen() {
  const [policy, setPolicyState] = useState<StoredPolicy | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  // Grant form
  const [perTx, setPerTx]   = useState('5');
  const [daily, setDaily]   = useState('20');
  const [total, setTotal]   = useState('100');
  const [allow, setAllow]   = useState('');
  const [days, setDays]     = useState('7');

  // Test-proposal form
  const [testTo, setTestTo]         = useState('');
  const [testAmount, setTestAmount] = useState('');

  const refresh = useCallback(() => {
    setPolicyState(getPolicy());
    setAudit(getAuditLog(20));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  function grant() {
    try {
      const addresses = allow
        .split(/[\s,]+/).map((a) => a.trim()).filter(Boolean);
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
      Alert.alert('Mandate granted', 'The agent may now spend within these limits.');
    } catch (e) {
      Alert.alert('Invalid mandate', e instanceof Error ? e.message : 'Check your inputs');
    }
  }

  function revoke() {
    Alert.alert('Revoke mandate', 'The agent will be unable to spend until you grant a new mandate.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Revoke', style: 'destructive', onPress: () => { revokePolicy(); refresh(); } },
    ]);
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

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card tone="warning">
            <Text style={styles.intro}>
              Grant the agent a spending mandate. It can pay autonomously within these
              hard limits — and never outside them. Revoke any time.
            </Text>
          </Card>

          {!policy ? (
            <>
              <Text style={styles.section}>New mandate</Text>
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
          ) : (
            <>
              <Text style={styles.section}>Active mandate</Text>
              <Card style={styles.card}>
                <Row label="Per transaction" value={`${usdc(policy.perTxLimit)} USDC`} />
                <Row label="Daily left" value={`${usdc(remaining(policy, getState(), Math.floor(Date.now()/1000)).today)} / ${usdc(policy.dailyLimit)} USDC`} />
                <Row label="Budget left" value={`${usdc(remaining(policy, getState(), Math.floor(Date.now()/1000)).total)} / ${usdc(policy.totalBudget)} USDC`} />
                <Row label="Recipients" value={policy.allowlist.length ? `${policy.allowlist.length} allowlisted` : 'Any (open)'} />
                <Row label="Expires" value={policy.expiresAt ? new Date(policy.expiresAt * 1000).toLocaleDateString() : 'Never'} />
              </Card>

              <Text style={styles.section}>Test the guardrails</Text>
              <Text style={styles.hint}>Dry-run a proposal — no funds move. Confirms the policy engine before the AI is connected.</Text>
              <Input label="Recipient" value={testTo} onChangeText={setTestTo} placeholder="0x…" autoCapitalize="none" autoCorrect={false} mono containerStyle={styles.field} />
              <Input label="Amount (USDC)" value={testAmount} onChangeText={setTestAmount} keyboardType="decimal-pad" containerStyle={styles.field} />
              <Button title="Test Proposal" variant="secondary" onPress={testProposal} style={styles.field} />

              <Button title="Revoke Mandate" variant="danger" onPress={revoke} style={styles.revoke} />
            </>
          )}

          {audit.length > 0 && (
            <>
              <Text style={styles.section}>Audit log</Text>
              {audit.map((a) => (
                <View key={a.id} style={styles.auditRow}>
                  <Ionicons
                    name={a.allowed ? 'checkmark-circle-outline' : 'close-circle-outline'}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  kav:       { flex: 1 },
  content:   { padding: SPACING.lg, gap: SPACING.sm },
  intro:     { fontSize: 13, color: COLORS.warning, lineHeight: 20 },

  section: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: SPACING.md, marginBottom: 4 },
  field:   { marginTop: SPACING.xs },
  textarea: { minHeight: 70, textAlignVertical: 'top', paddingTop: SPACING.sm },
  hint:    { fontSize: 12, color: COLORS.textDim, lineHeight: 18 },
  revoke:  { marginTop: SPACING.lg },

  card: { gap: 2 },
  row:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { fontSize: 13, color: COLORS.textMuted },
  rowValue: { fontSize: 13, color: COLORS.text, fontWeight: '600' },

  auditRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  auditBody: { flex: 1 },
  auditMain: { fontSize: 13, color: COLORS.text, fontFamily: 'monospace' },
  auditReason: { fontSize: 11, color: COLORS.textDim },
  auditTime: { fontSize: 10, color: COLORS.textDim },
});
