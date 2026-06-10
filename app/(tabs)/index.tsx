import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useWallet } from '@/hooks/useWallet';
import { useTransactions } from '@/hooks/useTransactions';
import { Card } from '@/components/ui/Card';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

export default function WalletScreen() {
  const { address, balance, isLoading, refresh } = useWallet();
  const { pendingCount } = useTransactions();

  const short = address
    ? `${address.slice(0, 10)}...${address.slice(-8)}`
    : '—';

  async function copyAddress() {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    Alert.alert('Copied', 'Wallet address copied to clipboard');
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refresh}
            tintColor={COLORS.accent}
          />
        }
      >
        <Text style={styles.heading}>Wallet</Text>

        {/* Balance card */}
        <Card accent style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>USDC Balance</Text>
          <Text style={styles.balance}>
            {isLoading ? '…' : balance ? Number(balance).toFixed(4) : '0.0000'}
          </Text>
          <Text style={styles.balanceCurrency}>USDC · Arc Testnet</Text>

          <TouchableOpacity onPress={copyAddress} activeOpacity={0.6} style={styles.addressRow}>
            <Text style={styles.address}>{short}</Text>
            <Text style={styles.copyHint}>tap to copy</Text>
          </TouchableOpacity>
        </Card>

        {/* Pending settlement banner */}
        {pendingCount > 0 && (
          <Card style={styles.pendingCard}>
            <Text style={styles.pendingText}>
              {pendingCount} tx pending settlement
            </Text>
            <Text style={styles.pendingHint}>
              Relaying via BLE · settles on Arc when online
            </Text>
          </Card>
        )}

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push('/send')}
            activeOpacity={0.85}
          >
            <Text style={styles.actionIcon}>↑</Text>
            <Text style={styles.actionLabel}>Send</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push('/receive')}
            activeOpacity={0.85}
          >
            <Text style={styles.actionIcon}>↓</Text>
            <Text style={styles.actionLabel}>Receive</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={copyAddress}
            activeOpacity={0.85}
          >
            <Text style={styles.actionIcon}>⎘</Text>
            <Text style={styles.actionLabel}>Copy</Text>
          </TouchableOpacity>
        </View>

        {/* Faucet */}
        <View style={styles.faucetRow}>
          <Text style={styles.faucetText}>
            Need testnet USDC?{' '}
            <Text
              style={styles.faucetLink}
              onPress={() => router.push('/receive')}
            >
              Get from faucet.circle.com
            </Text>
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: SPACING.lg, flexGrow: 1 },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  balanceCard: { marginBottom: SPACING.lg },
  balanceLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.xs,
  },
  balance: {
    fontSize: 44,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -1,
  },
  balanceCurrency: {
    fontSize: 12,
    color: COLORS.accent,
    marginBottom: SPACING.md,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  address: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontFamily: 'monospace',
  },
  copyHint: {
    fontSize: 10,
    color: COLORS.textDim,
    textDecorationLine: 'underline',
  },
  pendingCard: {
    marginBottom: SPACING.lg,
    borderColor: COLORS.warning,
  },
  pendingText: {
    fontSize: 14,
    color: COLORS.warning,
    fontWeight: '600',
    marginBottom: 2,
  },
  pendingHint: { fontSize: 12, color: COLORS.textMuted },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  actionIcon: {
    fontSize: 22,
    color: COLORS.accent,
    fontWeight: '300',
  },
  actionLabel: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '600',
  },
  faucetRow: { alignItems: 'center', marginTop: SPACING.md },
  faucetText: { fontSize: 12, color: COLORS.textDim, textAlign: 'center' },
  faucetLink: { color: COLORS.accent, textDecorationLine: 'underline' },
});
