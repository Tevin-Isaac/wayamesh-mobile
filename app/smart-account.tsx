import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Linking, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getSmartAccountAddress, getSmartAccountUsdcBalance, sendUsdcSponsored,
} from '@/wallet/smartAccount';
import { ACTIVE_AA_NETWORK } from '@/constants/aa';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { copyWithAutoClear } from '@/utils/clipboard';
import { COLORS, SPACING } from '@/constants/theme';

// Device-test harness for the smart-account + Circle Paymaster path (gas in USDC).
// Lets you verify on a real device before cutting the main send flow over. If this
// screen loads and works, the integration bundles correctly and the cutover is safe.

export default function SmartAccountScreen() {
  const net = ACTIVE_AA_NETWORK;
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [to, setTo]         = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy]     = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; msg: string; hash?: string } | null>(null);

  async function load() {
    setBusy('Deriving smart account…');
    setResult(null);
    try {
      const addr = await getSmartAccountAddress();
      setAddress(addr);
      setBusy('Reading USDC balance…');
      setBalance(await getSmartAccountUsdcBalance());
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Failed to load' });
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!to || !amount) return;
    setBusy('Submitting (gas paid in USDC)…');
    setResult(null);
    try {
      const hash = await sendUsdcSponsored(to, amount);
      setResult({ ok: true, msg: 'Sent — gas paid in USDC', hash });
      setBalance(await getSmartAccountUsdcBalance());
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Send failed' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card tone="warning">
            <Text style={styles.beta}>
              BETA · {net.key}{net.testnet ? ' (testnet)' : ''}. Smart account + Circle
              Paymaster — gas is paid in USDC, no native token needed.
            </Text>
          </Card>

          {!address ? (
            <Button title={busy ?? 'Load smart account'} onPress={load} loading={!!busy} disabled={!!busy} />
          ) : (
            <>
              <Card style={styles.card}>
                <Text style={styles.label}>Smart account address</Text>
                <Text style={styles.addr} selectable>{address}</Text>
                <TouchableOpacity
                  style={styles.copyRow}
                  onPress={() => copyWithAutoClear(address, 30_000)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="copy-outline" size={14} color={COLORS.accent} />
                  <Text style={styles.copyText}>Copy</Text>
                </TouchableOpacity>
                <Text style={styles.balance}>{balance ?? '—'} USDC</Text>
                <Text style={styles.fundHint}>
                  Fund this address with {net.testnet ? 'testnet ' : ''}USDC from faucet.circle.com,
                  then send below.
                </Text>
              </Card>

              <Input
                label="Recipient (0x...)"
                value={to}
                onChangeText={setTo}
                placeholder="0x..."
                autoCapitalize="none"
                autoCorrect={false}
                mono
                containerStyle={styles.field}
              />
              <Input
                label="Amount (USDC)"
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
                containerStyle={styles.field}
              />
              <Button
                title={busy ?? 'Send (gas in USDC)'}
                onPress={send}
                loading={!!busy}
                disabled={!!busy || !to || !amount}
                style={styles.field}
              />
            </>
          )}

          {busy && (
            <View style={styles.busyRow}>
              <ActivityIndicator color={COLORS.accent} size="small" />
              <Text style={styles.busyText}>{busy}</Text>
            </View>
          )}

          {result && (
            <Card tone={result.ok ? undefined : 'error'} style={styles.card}>
              <Text style={[styles.resultText, { color: result.ok ? COLORS.accent : COLORS.error }]}>
                {result.ok ? '✓ ' : '✗ '}{result.msg}
              </Text>
              {result.hash && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`${net.explorer}/tx/${result.hash}`)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.explorerLink}>View on explorer →</Text>
                </TouchableOpacity>
              )}
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  kav:       { flex: 1 },
  content:   { padding: SPACING.lg, gap: SPACING.md },
  beta:      { fontSize: 13, color: COLORS.warning, lineHeight: 20 },

  card:  { gap: SPACING.xs },
  label: { fontSize: 11, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  addr:  { fontSize: 13, color: COLORS.text, fontFamily: 'monospace', lineHeight: 18 },
  copyRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  copyText: { fontSize: 13, color: COLORS.accent },
  balance:  { fontSize: 28, fontWeight: '700', color: COLORS.text, fontFamily: 'monospace', marginTop: SPACING.xs },
  fundHint: { fontSize: 12, color: COLORS.textDim, lineHeight: 18 },

  field: { marginTop: SPACING.xs },

  busyRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: SPACING.sm },
  busyText: { fontSize: 13, color: COLORS.textMuted },

  resultText:  { fontSize: 14, fontWeight: '600' },
  explorerLink: { fontSize: 13, color: COLORS.accent, textDecorationLine: 'underline', marginTop: 4 },
});
