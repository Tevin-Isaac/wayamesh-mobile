import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '@/hooks/useWallet';
import { useTransactions } from '@/hooks/useTransactions';
import { Avatar, Eyebrow, QuickAction, StatusDot, Sparkline } from '@/components/pro';
import { copyWithAutoClear } from '@/utils/clipboard';
import { COLORS, SPACING, RADIUS, FONTS } from '@/constants/theme';
import type { TransactionRow } from '@/db/queries';

function shortAddr(a: string): string {
  if (a === 'native transfer') return 'Network transfer';
  if (a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function ActivityRow({ tx, myAddress }: { tx: TransactionRow; myAddress: string | null }) {
  const incoming = !!myAddress && tx.to_address.toLowerCase() === myAddress.toLowerCase();
  const who = incoming ? tx.from_address : tx.to_address;
  const date = new Date(tx.created_at * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return (
    <View style={styles.activityRow}>
      <Avatar seed={who} size={42} dir={incoming ? 'in' : 'out'} />
      <View style={styles.activityBody}>
        <Text style={styles.activityWho} numberOfLines={1}>{shortAddr(who)}</Text>
        <Text style={styles.activityDate}>{date}</Text>
      </View>
      <View style={styles.activityRight}>
        <Text style={[styles.activityAmt, incoming && styles.activityAmtIn]}>
          {incoming ? '+' : '−'}{tx.amount}
        </Text>
        <View style={{ marginTop: 3 }}><StatusDot status={tx.status} /></View>
      </View>
    </View>
  );
}

export default function WalletScreen() {
  const { address, balance, isLoading, refresh } = useWallet();
  const { transactions, pendingCount } = useTransactions();

  const bal = balance ? Number(balance) : 0;
  const [whole, dec] = bal.toFixed(2).split('.');

  async function copyAddress() {
    if (!address) return;
    await copyWithAutoClear(address, 30_000);
    Alert.alert('Copied', 'Address copied — clears from clipboard in 30 seconds.');
  }

  // Sparkline from cumulative recent activity (real data; hidden if < 2 txs).
  const sparkPoints = (() => {
    const amts = transactions.slice(0, 8).reverse().map((t) => Number(t.amount) || 0);
    if (amts.length < 2) return [];
    let acc = 0;
    return amts.map((a) => (acc += a));
  })();

  const recent = transactions.slice(0, 4);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={COLORS.accent} />}
      >
        {/* top bar */}
        <View style={styles.topBar}>
          <View style={styles.topLeft}>
            <Avatar seed={address ?? 'You'} size={40} />
            <View>
              <Text style={styles.greeting}>Welcome back</Text>
              <Text style={styles.greetingName}>Your wallet</Text>
            </View>
          </View>
          <View style={styles.pill}>
            <View style={styles.liveDot} />
            <Text style={styles.pillText}>Arc Testnet</Text>
          </View>
        </View>

        {/* balance hero */}
        <View style={styles.hero}>
          <View style={styles.balanceGlow} pointerEvents="none" />
          <Eyebrow style={styles.heroEyebrow}>Total balance</Eyebrow>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceSymbol}>$</Text>
            <Text style={styles.balanceWhole}>{isLoading ? '—' : whole}</Text>
            <Text style={styles.balanceDec}>.{isLoading ? '00' : dec}</Text>
          </View>
          <TouchableOpacity onPress={copyAddress} activeOpacity={0.7} style={styles.addrPill}>
            <Ionicons name="copy-outline" size={12} color={COLORS.textMuted} />
            <Text style={styles.addrText}>
              {address ? `${address.slice(0, 10)}…${address.slice(-6)}` : '—'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* sparkline */}
        {sparkPoints.length >= 2 && (
          <View style={styles.spark}><Sparkline points={sparkPoints} /></View>
        )}

        {/* quick actions */}
        <View style={styles.actions}>
          <QuickAction icon="arrow-up" label="Send" primary onPress={() => router.push('/send')} />
          <QuickAction icon="qr-code-outline" label="Request" onPress={() => router.push('/receive')} />
          <QuickAction icon="arrow-down" label="Receive" onPress={() => router.push('/receive')} />
          <QuickAction icon="scan-outline" label="Scan" onPress={() => router.push('/scan')} />
        </View>

        {/* mesh card */}
        <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/(tabs)/mesh')}>
          <View style={[styles.card, styles.meshCard]}>
            <View style={styles.meshIcon}><Ionicons name="radio-outline" size={20} color={COLORS.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.meshTitle}>Bluetooth mesh</Text>
              <Text style={styles.meshSub}>Tap to scan for nearby peers</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textDim} />
          </View>
        </TouchableOpacity>

        {/* pending banner */}
        {pendingCount > 0 && (
          <View style={[styles.card, styles.pendingCard]}>
            <View style={styles.pendingDot} />
            <View>
              <Text style={styles.pendingTitle}>{pendingCount} tx relaying over mesh</Text>
              <Text style={styles.pendingSub}>Settles on Arc when you reconnect</Text>
            </View>
          </View>
        )}

        {/* recent activity */}
        <View style={styles.activityHead}>
          <Eyebrow>Recent</Eyebrow>
          {transactions.length > 4 && (
            <TouchableOpacity onPress={() => router.push('/(tabs)/history')} activeOpacity={0.7}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          )}
        </View>
        {recent.length > 0 ? (
          recent.map((tx) => <ActivityRow key={tx.hash} tx={tx} myAddress={address} />)
        ) : (
          <Text style={styles.empty}>No transactions yet — send USDC offline and it'll appear here.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: SPACING.lg, paddingBottom: SPACING.xxl },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.lg },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  greeting: { fontSize: 12, color: COLORS.textDim },
  greetingName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.accent },
  pillText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500' },

  hero: { alignItems: 'center', marginBottom: SPACING.sm, position: 'relative', paddingVertical: SPACING.sm },
  balanceGlow: {
    position: 'absolute', top: '30%', alignSelf: 'center', width: 240, height: 120,
    borderRadius: 120, backgroundColor: COLORS.accent, opacity: 0.12,
  },
  heroEyebrow: { marginBottom: 10 },
  balanceRow: { flexDirection: 'row', alignItems: 'baseline' },
  balanceSymbol: { fontFamily: FONTS.mono, fontSize: 30, color: COLORS.textMuted, marginRight: 4 },
  balanceWhole: { fontFamily: FONTS.mono, fontSize: 60, fontWeight: '700', color: COLORS.text, letterSpacing: -2, lineHeight: 64 },
  balanceDec: { fontFamily: FONTS.mono, fontSize: 34, fontWeight: '700', color: COLORS.textMuted },
  addrPill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  addrText: { fontSize: 12, color: COLORS.textMuted, fontFamily: FONTS.mono },

  spark: { height: 44, marginVertical: SPACING.md },

  actions: { flexDirection: 'row', gap: 6, marginBottom: SPACING.lg },

  card: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, padding: 16,
  },
  meshCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: SPACING.md },
  meshIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.accentSoft, alignItems: 'center', justifyContent: 'center' },
  meshTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  meshSub: { fontSize: 12, color: COLORS.textMuted },

  pendingCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: SPACING.md,
    backgroundColor: COLORS.warningSoft, borderColor: 'rgba(245,166,35,0.3)',
  },
  pendingDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.warning },
  pendingTitle: { fontSize: 14, fontWeight: '600', color: COLORS.warning },
  pendingSub: { fontSize: 12, color: COLORS.textMuted },

  activityHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.sm, marginBottom: SPACING.sm },
  seeAll: { fontSize: 12, color: COLORS.accent, fontWeight: '600' },

  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  activityBody: { flex: 1, minWidth: 0 },
  activityWho: { fontSize: 14, fontWeight: '600', color: COLORS.text, fontFamily: FONTS.mono },
  activityDate: { fontSize: 12, color: COLORS.textDim },
  activityRight: { alignItems: 'flex-end' },
  activityAmt: { fontFamily: FONTS.mono, fontSize: 15, fontWeight: '700', color: COLORS.text },
  activityAmtIn: { color: COLORS.success },

  empty: { fontSize: 13, color: COLORS.textDim, lineHeight: 20, paddingVertical: SPACING.md },
});
