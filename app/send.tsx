import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useWallet } from '@/hooks/useWallet';
import { validateTransfer } from '@/agent/validator';
import { buildOfflineTransfer } from '@/wallet/transactions';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { COLORS, SPACING } from '@/constants/theme';

export default function SendScreen() {
  const { address, balance, unlock } = useWallet();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);

  const validation = validateTransfer(to, amount, balance ?? '0');

  async function handleSend() {
    if (!validation.valid) {
      Alert.alert('Invalid', validation.reason);
      return;
    }

    setSending(true);
    try {
      const wallet = await unlock();
      if (!wallet) {
        Alert.alert('Auth failed', 'Could not unlock wallet');
        return;
      }

      // Nonce 0 for offline signing — mesh relay / settlement handles ordering
      await buildOfflineTransfer(wallet, to, amount, 0);

      Alert.alert(
        'Transaction queued',
        'Signed offline. It will relay over Bluetooth mesh and settle on Arc when you go online.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
        <View style={styles.content}>
          <Card style={styles.fromCard}>
            <Text style={styles.label}>From</Text>
            <Text style={styles.fromAddr}>{address ? `${address.slice(0, 8)}...${address.slice(-6)}` : '—'}</Text>
            <Text style={styles.balanceHint}>Balance: {balance ?? '—'} USDC</Text>
          </Card>

          <Text style={styles.inputLabel}>Recipient Address</Text>
          <TextInput
            style={styles.input}
            value={to}
            onChangeText={setTo}
            placeholder="0x..."
            placeholderTextColor={COLORS.textDim}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.inputLabel}>Amount (USDC)</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={COLORS.textDim}
            keyboardType="decimal-pad"
          />

          {validation.valid && amount && to ? (
            <Card style={styles.summaryCard} accent>
              <Text style={styles.summaryRow}>Est. fee: {validation.estimatedGas}</Text>
              <Text style={styles.summaryRow}>Settlement: Arc (~480ms when online)</Text>
            </Card>
          ) : null}

          {!validation.valid && (to || amount) ? (
            <Text style={styles.errorText}>{validation.reason}</Text>
          ) : null}
        </View>

        <Button
          title="Sign & Queue Offline"
          onPress={handleSend}
          loading={sending}
          disabled={!validation.valid}
          style={styles.sendBtn}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  kav: { flex: 1 },
  content: { flex: 1, padding: SPACING.lg },
  fromCard: { marginBottom: SPACING.lg },
  label: { fontSize: 12, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: SPACING.xs },
  fromAddr: { fontSize: 14, color: COLORS.text, fontFamily: 'monospace' },
  balanceHint: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  inputLabel: { fontSize: 13, color: COLORS.textMuted, marginBottom: SPACING.xs, marginTop: SPACING.md },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: SPACING.md,
    color: COLORS.text,
    fontSize: 16,
    fontFamily: 'monospace',
  },
  summaryCard: { marginTop: SPACING.md },
  summaryRow: { fontSize: 13, color: COLORS.textMuted, marginBottom: 2 },
  errorText: { color: COLORS.error, fontSize: 13, marginTop: SPACING.sm },
  sendBtn: { margin: SPACING.lg },
});
