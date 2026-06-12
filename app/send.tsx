import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import { useWallet } from '@/hooks/useWallet';
import { validateTransfer } from '@/agent/validator';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { COLORS, SPACING } from '@/constants/theme';

export default function SendScreen() {
  const { address, balance } = useWallet();
  const { scannedAddress }   = useLocalSearchParams<{ scannedAddress?: string }>();

  const [to, setTo]         = useState('');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (scannedAddress) setTo(scannedAddress);
  }, [scannedAddress]);

  const validation = validateTransfer(to, amount, balance ?? '0');

  // Show checksum-normalised address in the "To" card once it's valid
  const displayTo = ethers.isAddress(to) ? ethers.getAddress(to) : to;

  function handleReview() {
    if (!validation.valid) return;
    router.push({ pathname: '/confirm', params: { to: displayTo, amount } });
  }

  const shortAddr = (addr: string) => `${addr.slice(0, 8)}…${addr.slice(-6)}`;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
        <View style={styles.content}>

          <Card style={styles.fromCard}>
            <Text style={styles.label}>From</Text>
            <Text style={styles.fromAddr}>{address ? shortAddr(address) : '—'}</Text>
            <Text style={styles.balanceHint}>
              Balance:{' '}
              <Text style={styles.balanceValue}>
                {balance ? `${Number(balance).toFixed(4)} USDC` : '—'}
              </Text>
            </Text>
            <Text style={styles.networkHint}>Arc Testnet · USDC native</Text>
          </Card>

          <Input
            label="Recipient Address"
            value={to}
            onChangeText={setTo}
            placeholder="0x..."
            autoCapitalize="none"
            autoCorrect={false}
            mono
            containerStyle={styles.inputGap}
            hint={ethers.isAddress(to) ? `✓ EIP-55: ${shortAddr(displayTo)}` : undefined}
            hintActive={ethers.isAddress(to)}
            rightSlot={
              <TouchableOpacity onPress={() => router.push('/scan')} activeOpacity={0.8} style={styles.scanBtn}>
                <Ionicons name="qr-code-outline" size={22} color={COLORS.accent} />
              </TouchableOpacity>
            }
          />

          <Input
            label="Amount (USDC)"
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
            containerStyle={styles.inputGap}
            rightSlot={
              <TouchableOpacity
                onPress={() => {
                  const max = Math.max(0, parseFloat(balance ?? '0') - 0.0001);
                  setAmount(max.toFixed(6));
                }}
                activeOpacity={0.8}
                style={styles.maxBtn}
              >
                <Text style={styles.maxBtnText}>MAX</Text>
              </TouchableOpacity>
            }
          />

          {!validation.valid && (to || amount) ? (
            <Text style={styles.errorText}>{validation.reason}</Text>
          ) : null}

          {validation.valid && amount && to ? (
            <Card style={styles.previewCard} accent>
              <Text style={styles.previewRow}>
                Sending <Text style={styles.previewVal}>{amount} USDC</Text> to{' '}
                <Text style={styles.previewVal}>{shortAddr(displayTo)}</Text>
              </Text>
              <Text style={styles.previewNote}>
                Network fee shown next · signed offline · settles on Arc when you reconnect
              </Text>
            </Card>
          ) : null}
        </View>

        <Button
          title="Review Transaction"
          onPress={handleReview}
          disabled={!validation.valid}
          style={styles.reviewBtn}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  kav:       { flex: 1 },
  content:   { flex: 1, padding: SPACING.lg },

  fromCard:    { marginBottom: SPACING.lg },
  label:       { fontSize: 12, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: SPACING.xs },
  fromAddr:    { fontSize: 15, color: COLORS.text, fontFamily: 'monospace', marginBottom: 2 },
  balanceHint: { fontSize: 13, color: COLORS.textMuted, marginBottom: 2 },
  balanceValue: { color: COLORS.accent, fontWeight: '600' },
  networkHint: { fontSize: 11, color: COLORS.textDim },

  inputGap: { marginTop: SPACING.md },
  scanBtn:  { paddingLeft: 4, paddingVertical: 8 },
  maxBtn:   { paddingLeft: 4, paddingVertical: 8 },
  maxBtnText: { color: COLORS.accent, fontWeight: '700', fontSize: 13 },

  errorText: { color: COLORS.error, fontSize: 13, marginTop: SPACING.sm },

  previewCard: { marginTop: SPACING.md, gap: 4 },
  previewRow:  { fontSize: 13, color: COLORS.textMuted },
  previewVal:  { color: COLORS.text, fontWeight: '600' },
  previewNote: { fontSize: 11, color: COLORS.textDim, marginTop: 2 },

  reviewBtn: { margin: SPACING.lg },
});
