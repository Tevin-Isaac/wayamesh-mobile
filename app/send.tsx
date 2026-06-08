import { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Alert,
  KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useWallet } from '@/hooks/useWallet';
import { validateTransfer } from '@/agent/validator';
import { buildOfflineTransfer, getOnChainNonce } from '@/wallet/transactions';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { COLORS, SPACING } from '@/constants/theme';
import { CHAIN } from '@/constants/chain';

export default function SendScreen() {
  const { address, balance, unlock } = useWallet();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [sentTxHash, setSentTxHash] = useState<string | null>(null);

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
        Alert.alert('Auth failed', 'Could not unlock wallet. Try again.');
        return;
      }

      // Try to get live nonce from Arc — fall back to 0 if offline
      let nonce = 0;
      try {
        nonce = await getOnChainNonce(wallet.address);
      } catch {
        // Offline — nonce 0, Arc handles ordering via transaction hash
      }

      const tx = await buildOfflineTransfer(wallet, to, amount, nonce);
      setSentTxHash(tx.hash);

      Alert.alert(
        'Transaction signed',
        `Queued offline. It will relay over Bluetooth mesh and settle on Arc when connected.\n\nTx: ${tx.hash.slice(0, 16)}...`,
        [{ text: 'Done', onPress: () => router.back() }],
      );
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSending(false);
    }
  }

  const shortAddr = (addr: string) => `${addr.slice(0, 8)}...${addr.slice(-6)}`;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
        <View style={styles.content}>
          <Card style={styles.fromCard}>
            <Text style={styles.label}>From</Text>
            <Text style={styles.fromAddr}>{address ? shortAddr(address) : '—'}</Text>
            <Text style={styles.balanceHint}>
              Balance: <Text style={styles.balanceValue}>{balance ? `${Number(balance).toFixed(4)} USDC` : '—'}</Text>
            </Text>
            <Text style={styles.networkHint}>Arc Testnet · USDC native</Text>
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
              <Text style={styles.summaryRow}>Sending: <Text style={styles.summaryVal}>{amount} USDC</Text></Text>
              <Text style={styles.summaryRow}>Est. gas: <Text style={styles.summaryVal}>{validation.estimatedGas}</Text></Text>
              <Text style={styles.summaryRow}>Settlement: Arc (~480ms finality)</Text>
              <Text style={styles.summaryNote}>Signed offline · relayed via BLE · settles when online</Text>
            </Card>
          ) : null}

          {!validation.valid && (to || amount) ? (
            <Text style={styles.errorText}>{validation.reason}</Text>
          ) : null}

          {sentTxHash ? (
            <Text
              style={styles.explorerLink}
              onPress={() => Linking.openURL(`${CHAIN.explorer}/tx/${sentTxHash}`)}
            >
              View on Arc Explorer →
            </Text>
          ) : null}
        </View>

        <Button
          title={sending ? 'Signing...' : 'Sign & Queue Offline'}
          onPress={handleSend}
          loading={sending}
          disabled={!validation.valid || sending}
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
  fromAddr: { fontSize: 15, color: COLORS.text, fontFamily: 'monospace', marginBottom: 2 },
  balanceHint: { fontSize: 13, color: COLORS.textMuted, marginBottom: 2 },
  balanceValue: { color: COLORS.accent, fontWeight: '600' },
  networkHint: { fontSize: 11, color: COLORS.textDim },
  inputLabel: { fontSize: 13, color: COLORS.textMuted, marginBottom: SPACING.xs, marginTop: SPACING.md },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: SPACING.md,
    color: COLORS.text,
    fontSize: 15,
    fontFamily: 'monospace',
  },
  summaryCard: { marginTop: SPACING.md, gap: 4 },
  summaryRow: { fontSize: 13, color: COLORS.textMuted },
  summaryVal: { color: COLORS.text, fontWeight: '600' },
  summaryNote: { fontSize: 11, color: COLORS.textDim, marginTop: 4 },
  errorText: { color: COLORS.error, fontSize: 13, marginTop: SPACING.sm },
  explorerLink: { color: COLORS.accent, fontSize: 13, marginTop: SPACING.md, textDecorationLine: 'underline' },
  sendBtn: { margin: SPACING.lg },
});
