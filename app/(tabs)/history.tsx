import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTransactions } from '@/hooks/useTransactions';
import { Card } from '@/components/ui/Card';
import { COLORS, SPACING } from '@/constants/theme';
import type { TransactionRow, TxStatus } from '@/db/queries';

const STATUS_COLOR: Record<TxStatus, string> = {
  pending: COLORS.warning,
  relayed: COLORS.pending,
  settled: COLORS.success,
  failed: COLORS.error,
};

function TxItem({ tx }: { tx: TransactionRow }) {
  const date = new Date(tx.created_at * 1000).toLocaleString();
  const short = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <Card style={styles.txCard}>
      <View style={styles.txRow}>
        <Text style={styles.txAmount}>{tx.amount} USDC</Text>
        <Text style={[styles.txStatus, { color: STATUS_COLOR[tx.status] }]}>
          {tx.status.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.txAddr}>To: {short(tx.to_address)}</Text>
      <Text style={styles.txDate}>{date}</Text>
    </Card>
  );
}

export default function HistoryScreen() {
  const { transactions, refresh } = useTransactions();

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.hash}
        renderItem={({ item }) => <TxItem tx={item} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={styles.heading}>History</Text>}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No transactions yet</Text>
            <Text style={styles.emptyHint}>Send USDC offline — it'll appear here</Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={refresh} tintColor={COLORS.accent} />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  list: { padding: SPACING.lg, gap: SPACING.sm },
  heading: { fontSize: 28, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.md },
  txCard: { gap: 4 },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  txAmount: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  txStatus: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  txAddr: { fontSize: 12, color: COLORS.textMuted, fontFamily: 'monospace' },
  txDate: { fontSize: 11, color: COLORS.textDim },
  empty: { alignItems: 'center', paddingTop: SPACING.xxl },
  emptyText: { fontSize: 16, color: COLORS.textMuted, fontWeight: '600' },
  emptyHint: { fontSize: 13, color: COLORS.textDim, marginTop: SPACING.xs },
});
