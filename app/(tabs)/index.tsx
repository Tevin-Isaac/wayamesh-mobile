import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useWallet } from '@/hooks/useWallet';
import { useTransactions } from '@/hooks/useTransactions';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { copyWithAutoClear } from '@/utils/clipboard';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import type { TransactionRow, TxStatus } from '@/db/queries';

function ActionTile({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.actionTile} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.actionIcon}>{icon}</Text>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function TxRow({ tx }: { tx: TransactionRow }) {
  const date  = new Date(tx.created_at * 1000).toLocaleString();
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  return (
    <Card padding={14} style={styles.txCard}>
      <View style={styles.txTop}>
        <Text style={styles.txAmount}>{tx.amount} USDC</Text>
        <Badge status={tx.status as TxStatus}>{tx.status}</Badge>
      </View>
      <Text style={styles.txAddr}>To: {short(tx.to_address)}</Text>
      <Text style={styles.txDate}>{date}</Text>
    </Card>
  );
}

export default function WalletScreen() {
  const { address, balance, isLoading, refresh } = useWallet();
  const { transactions, pendingCount } = useTransactions();

  const short = address
    ? `${address.slice(0, 10)}…${address.slice(-8)}`
    : '—';

  async function copyAddress() {
    if (!address) return;
    await copyWithAutoClear(address, 30_000);
    Alert.alert('Copied', 'Address copied — clears from clipboard in 30 seconds.');
  }

  const recentTxs = transactions.slice(0, 3);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={COLORS.accent} />
        }
      >
        <Text style={styles.heading}>Wallet</Text>

        {/* Balance card */}
        <Card accent style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>USDC Balance</Text>
          <Text style={styles.balance}>
            {isLoading ? '…' : balance ? Number(balance).toFixed(4) : '0.0000'}
          </Text>
          <Text style={styles.balanceSub}>USDC · Arc Testnet</Text>
          <TouchableOpacity onPress={copyAddress} activeOpacity={0.7} style={styles.addrRow}>
            <Text style={styles.addr}>{short}</Text>
            <Text style={styles.copyHint}>tap to copy</Text>
          </TouchableOpacity>
        </Card>

        {/* Pending settlement banner */}
        {pendingCount > 0 && (
          <Card tone="warning" style={styles.pendingCard}>
            <Text style={styles.pendingText}>{pendingCount} tx pending settlement</Text>
            <Text style={styles.pendingHint}>Relaying via BLE · settles on Arc when online</Text>
          </Card>
        )}

        {/* Action tiles */}
        <View style={styles.actions}>
          <ActionTile icon="↑" label="Send"    onPress={() => router.push('/send')} />
          <ActionTile icon="↓" label="Receive" onPress={() => router.push('/receive')} />
          <ActionTile icon="⎘" label="Copy"    onPress={copyAddress} />
        </View>

        {/* Recent transactions */}
        {recentTxs.length > 0 && (
          <>
            <Text style={styles.eyebrow}>Recent</Text>
            <View style={styles.txList}>
              {recentTxs.map(tx => <TxRow key={tx.hash} tx={tx} />)}
            </View>
            {transactions.length > 3 && (
              <TouchableOpacity onPress={() => router.push('/(tabs)/history')} activeOpacity={0.7} style={styles.seeAll}>
                <Text style={styles.seeAllText}>See all transactions →</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <Text style={styles.faucetText}>
          Need testnet USDC?{' '}
          <Text style={styles.faucetLink} onPress={() => router.push('/receive')}>
            Get from faucet.circle.com
          </Text>
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll:    { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  heading:   { fontSize: 28, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.lg, letterSpacing: -0.3 },

  balanceCard: { marginBottom: SPACING.lg },
  balanceLabel: {
    fontSize: 11, fontWeight: '600', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
  },
  balance: {
    fontFamily: 'monospace',
    fontSize: 44, fontWeight: '700', color: COLORS.text,
    letterSpacing: -1, lineHeight: 52,
  },
  balanceSub: { fontSize: 12, color: COLORS.accent, marginBottom: SPACING.md },
  addrRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addr:      { fontSize: 12, color: COLORS.textMuted, fontFamily: 'monospace' },
  copyHint:  { fontSize: 10, color: COLORS.textDim, textDecorationLine: 'underline' },

  pendingCard: { marginBottom: SPACING.lg },
  pendingText: { fontSize: 14, fontWeight: '600', color: COLORS.warning, marginBottom: 2 },
  pendingHint: { fontSize: 12, color: COLORS.textMuted },

  actions: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  actionTile: {
    flex: 1, backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg, paddingVertical: 18,
    alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  actionIcon:  { fontSize: 22, color: COLORS.accent, fontWeight: '300', lineHeight: 26 },
  actionLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text },

  eyebrow: {
    fontSize: 11, fontWeight: '600', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: SPACING.sm,
  },
  txList:  { gap: SPACING.sm, marginBottom: SPACING.sm },
  txCard:  { gap: 4 },
  txTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  txAmount: { fontFamily: 'monospace', fontSize: 16, fontWeight: '700', color: COLORS.text },
  txAddr:  { fontSize: 12, color: COLORS.textMuted, fontFamily: 'monospace' },
  txDate:  { fontSize: 11, color: COLORS.textDim },

  seeAll:     { alignItems: 'center', paddingVertical: SPACING.sm, marginBottom: SPACING.sm },
  seeAllText: { fontSize: 13, color: COLORS.accent, textDecorationLine: 'underline' },

  faucetText: { fontSize: 12, color: COLORS.textDim, textAlign: 'center', marginTop: SPACING.md },
  faucetLink: { color: COLORS.accent, textDecorationLine: 'underline' },
});
