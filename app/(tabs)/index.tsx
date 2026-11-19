import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { getMyName } from '@/chat/identity';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '@/hooks/useWallet';
import { useTransactions } from '@/hooks/useTransactions';
import { Avatar, Eyebrow, QuickAction, StatusDot, Sparkline } from '@/components/pro';
import { copyWithAutoClear } from '@/utils/clipboard';
import { getCachedReserve, fetchReserve } from '@/wallet/meshpay';
import { tryAdd, truncate, exact6 } from '@/utils/money';
import { useOnline } from '@/hooks/useOnline';
import { ACTIVE_CHAIN } from '@/constants/chain';
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
  const { address, balance, stale, balanceAt, isLoading, refresh } = useWallet();
  const { transactions, pendingCount } = useTransactions();
  const online = useOnline();

  const [myName, setMyNameState] = useState('');
  useFocusEffect(useCallback(() => { try { setMyNameState(getMyName()); } catch { setMyNameState(''); } }, []));

  // Total balance = what is in the wallet on-chain + what is in the offline reserve (both are yours).
  // The reserve comes from the cache instantly and is refreshed from chain whenever this screen opens or is pulled.
  const [reserveAmt, setReserveAmt] = useState<string | null>(null);
  useEffect(() => {
    // Always start from THIS address's cache (or nothing), and ignore a fetch that resolves after the address changed.
    let live = true;
    setReserveAmt(address ? getCachedReserve(address)?.amount ?? null : null);
    if (address) {
      fetchReserve(address)
        .then((v) => { if (live) setReserveAmt(v); })
        .catch(() => { /* offline: keep the last known value */ });
    }
    return () => { live = false; };
  }, [address, isLoading]);
  const reserveCached = reserveAmt !== null ? { amount: reserveAmt } : null;
  // Exact maths on decimal strings; display truncates (never rounds up). Unknown stays unknown: no made-up zeros.
  // If the wallet balance is known but the reserve could not be read (offline, never funded), the total shows the
  // wallet part and says so, instead of hiding a balance we do know.
  const totalStr = tryAdd(balance, reserveAmt ?? '0');
  const reservePartial = balance !== null && reserveAmt === null;
  const [whole, dec] = totalStr ? truncate(totalStr, 2).split('.') : ['—', '--'];
  const walletExact = balance !== null ? exact6(balance) : null;
  const reserveExact = reserveAmt !== null ? exact6(reserveAmt) : null;
  const totalNum = totalStr !== null ? Number(totalStr) : null;
  const showFaucet = ACTIVE_CHAIN.testnet && !isLoading && totalNum !== null && totalNum < 1;
  const staleMins = stale && balanceAt ? Math.max(1, Math.round((Date.now() / 1000 - balanceAt) / 60)) : null;

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
            <View>
              <Text style={styles.greeting}>Welcome back</Text>
              <Text style={styles.greetingName} numberOfLines={1}>{myName || 'Your wallet'}</Text>
            </View>
          </View>
          <View style={[styles.pill, !online && styles.pillOff]}>
            <View style={[styles.liveDot, !online && styles.liveDotOff]} />
            <Text style={[styles.pillText, !online && styles.pillTextOff]}>{online ? 'Online' : 'Offline'}</Text>
          </View>
        </View>

        {/* balance hero */}
        <View style={styles.hero}>
          <View style={styles.balanceGlow} pointerEvents="none" />
          <Eyebrow style={styles.heroEyebrow}>Total balance</Eyebrow>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceSymbol}>$</Text>
            <Text style={styles.balanceWhole}>{isLoading ? '—' : whole}</Text>
            <Text style={styles.balanceDec}>.{isLoading ? '--' : dec}</Text>
          </View>
          <View style={styles.splitRow}>
            <View style={styles.splitItem}>
              <Text style={styles.splitLabel}>IN WALLET</Text>
              <Text style={styles.splitValue}>{isLoading || walletExact === null ? '—' : `$${walletExact}`}</Text>
            </View>
            <View style={styles.splitDivider} />
            <View style={styles.splitItem}>
              <Text style={styles.splitLabel}>OFFLINE RESERVE</Text>
              <Text style={styles.splitValue}>{reserveExact === null ? '—' : `$${reserveExact}`}</Text>
            </View>
          </View>
          {!isLoading && stale && (
            <Text style={styles.staleNote}>
              Offline · last known{staleMins ? `, ${staleMins < 60 ? `${staleMins} min` : `${Math.round(staleMins / 60)} h`} ago` : ''}
            </Text>
          )}
          {!isLoading && !stale && reservePartial && (
            <Text style={styles.staleNote}>Offline reserve unavailable right now, so the total shows your wallet balance only.</Text>
          )}
          {!isLoading && !stale && balance === null && (
            <Text style={styles.staleNote}>Can’t reach the network, so the balance is unknown. Pull down to retry.</Text>
          )}
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
          <QuickAction icon="arrow-down" label="Receive" onPress={() => router.push('/receive')} />
          <QuickAction icon="scan-outline" label="Scan" onPress={() => router.push('/scan')} />
          <QuickAction icon="add" label="Add" onPress={() => router.push('/ramp')} />
        </View>

        {/* test USDC (testnet only) */}
        {showFaucet && (
          <View style={styles.faucetCard}>
            <View style={styles.faucetHead}>
              <Ionicons name="water-outline" size={18} color={COLORS.accent} />
              <Text style={styles.faucetTitle}>Get free test USDC</Text>
            </View>
            <Text style={styles.faucetBody}>
              This is a test network, so the money is free. Open the Circle faucet, choose {ACTIVE_CHAIN.name} and USDC, and paste your address.
            </Text>
            <View style={styles.faucetBtns}>
              <TouchableOpacity style={styles.faucetBtn} onPress={copyAddress} activeOpacity={0.8}>
                <Ionicons name="copy-outline" size={16} color={COLORS.accent} />
                <Text style={styles.faucetBtnText}>Copy my address</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.faucetBtn, styles.faucetBtnPrimary]} onPress={() => Linking.openURL(ACTIVE_CHAIN.faucet ?? 'https://faucet.circle.com')} activeOpacity={0.85}>
                <Ionicons name="open-outline" size={16} color={COLORS.bg} />
                <Text style={[styles.faucetBtnText, { color: COLORS.bg }]}>Open faucet</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* offline reserve (MeshPayV2) */}
        <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/reserve')}>
          <View style={[styles.card, styles.meshCard]}>
            <View style={styles.meshIcon}><Ionicons name="shield-checkmark-outline" size={20} color={COLORS.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.meshTitle}>Offline reserve</Text>
              <Text style={styles.meshSub}>
                {reserveCached ? `$${exact6(reserveCached.amount)} backing your offline payments` : 'Pre-fund so offline payments are verifiably backed'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textDim} />
          </View>
        </TouchableOpacity>

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
          <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/reserve')}>
            <View style={[styles.card, styles.pendingCard]}>
              <View style={styles.pendingDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingTitle}>{pendingCount} payment{pendingCount > 1 ? 's' : ''} waiting to settle</Text>
                <Text style={styles.pendingSub}>Tap to settle now, or it settles when you reconnect</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textDim} />
            </View>
          </TouchableOpacity>
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
  pillOff: { borderColor: 'rgba(245,166,35,0.4)' },
  liveDotOff: { backgroundColor: COLORS.warning },
  pillTextOff: { color: COLORS.warning },
  staleNote: { fontSize: 12, color: COLORS.warning, textAlign: 'center', marginTop: 8, paddingHorizontal: SPACING.md },
  faucetCard: {
    backgroundColor: COLORS.accentSoft, borderWidth: 1, borderColor: 'rgba(62,217,184,0.28)', borderRadius: RADIUS.lg,
    padding: SPACING.md, gap: 10, marginBottom: SPACING.sm,
  },
  faucetHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  faucetTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  faucetBody: { fontSize: 13, color: COLORS.textMuted, lineHeight: 19 },
  faucetBtns: { flexDirection: 'row', gap: 10 },
  faucetBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 11,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(62,217,184,0.4)',
  },
  faucetBtnPrimary: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  faucetBtnText: { fontSize: 13.5, fontWeight: '700', color: COLORS.accent },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 14, marginBottom: 4 },
  splitItem: { alignItems: 'center', gap: 2 },
  splitLabel: { fontSize: 10, letterSpacing: 1.2, color: COLORS.textDim, fontFamily: FONTS.mono },
  splitValue: { fontSize: 15, color: COLORS.text, fontFamily: FONTS.mono, fontWeight: '700' },
  splitDivider: { width: 1, height: 26, backgroundColor: COLORS.border },
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
