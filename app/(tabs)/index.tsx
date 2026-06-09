import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useWallet } from '@/hooks/useWallet';
import { useTransactions } from '@/hooks/useTransactions';
import { Card } from '@/components/ui/Card';
import { COLORS, SPACING } from '@/constants/theme';

export default function WalletScreen() {
  const { address, balance, isLoading, refresh } = useWallet();
  const { pendingCount } = useTransactions();

  const short = address
    ? `${address.slice(0, 8)}...${address.slice(-6)}`
    : '—';

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

        <Card accent style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>USDC Balance</Text>
          <Text style={styles.balance}>
            {balance ? Number(balance).toFixed(4) : '—'}
          </Text>
          <Text style={styles.balanceCurrency}>USDC · Arc Testnet</Text>
          <Text style={styles.address}>{short}</Text>
        </Card>

        {pendingCount > 0 && (
          <Card style={styles.pendingCard}>
            <Text style={styles.pendingText}>
              {pendingCount} transaction{pendingCount > 1 ? 's' : ''} pending settlement
            </Text>
            <Text style={styles.pendingHint}>
              Relaying via BLE · will settle on Arc when online
            </Text>
          </Card>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push('/send')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Send USDC</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            activeOpacity={0.7}
            onPress={async () => {
              if (address) {
                await Clipboard.setStringAsync(address);
                Alert.alert('Copied', 'Wallet address copied to clipboard');
              }
            }}
          >
            <Text style={styles.secondaryBtnText}>Copy Address</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.faucetRow}>
          <Text style={styles.faucetText}>
            Need testnet USDC?{' '}
            <Text
              style={styles.faucetLink}
              onPress={() => router.push('/send')}
            >
              faucet.circle.com
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
    marginBottom: SPACING.sm,
  },
  address: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontFamily: 'monospace',
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
  actions: { gap: SPACING.sm, marginBottom: SPACING.lg },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: COLORS.accent,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryBtnText: {
    color: COLORS.bg,
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryBtnText: {
    color: COLORS.textMuted,
    fontSize: 15,
  },
  faucetRow: { alignItems: 'center', marginTop: SPACING.md },
  faucetText: { fontSize: 12, color: COLORS.textDim },
  faucetLink: { color: COLORS.accent, textDecorationLine: 'underline' },
});
