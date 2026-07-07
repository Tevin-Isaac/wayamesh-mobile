import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTransactions } from '@/hooks/useTransactions';
import { useWallet } from '@/hooks/useWallet';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { COLORS, SPACING } from '@/constants/theme';
import type { TransactionRow, TxStatus } from '@/db/queries';

function shortAddr(a: string): string {
  if (a === 'native transfer') return 'Network transfer';
  if (a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function TxItem({ tx, myAddress }: { tx: TransactionRow; myAddress: string | null }) {
  const incoming = !!myAddress && tx.to_address.toLowerCase() === myAddress.toLowerCase();
  const date = new Date(tx.created_at * 1000).toLocaleString();
  return (
    <Card padding={14} style={styles.txCard}>
      <View style={styles.txTop}>
        <Text style={[styles.txAmount, incoming && styles.txAmountIn]}>
          {incoming ? '+' : '−'}{tx.amount} USDC
        </Text>
        <Badge status={tx.status as TxStatus}>{tx.status}</Badge>
      </View>
      <Text style={styles.txAddr}>
        {incoming ? `From: ${shortAddr(tx.from_address)}` : `To: ${shortAddr(tx.to_address)}`}
      </Text>
      <Text style={styles.txDate}>{date}</Text>
    </Card>
  );
}

export default function HistoryScreen() {
  const { transactions, refresh } = useTransactions();
  const { address } = useWallet();
  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={transactions}
        keyExtractor={item => item.hash}
        renderItem={({ item }) => <TxItem tx={item} myAddress={address} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: SPACING.sm }} />}
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
  list:      { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  heading:   { fontSize: 28, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.lg, letterSpacing: -0.3 },
  txCard:    { gap: 4 },
  txTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  txAmount:  { fontFamily: 'monospace', fontSize: 16, fontWeight: '700', color: COLORS.text },
  txAmountIn:{ color: COLORS.success },
  txAddr:    { fontSize: 12, color: COLORS.textMuted, fontFamily: 'monospace' },
  txDate:    { fontSize: 11, color: COLORS.textDim },
  empty:     { alignItems: 'center', paddingTop: SPACING.xxl },
  emptyText: { fontSize: 16, color: COLORS.textMuted, fontWeight: '600' },
  emptyHint: { fontSize: 13, color: COLORS.textDim, marginTop: SPACING.xs },
});
