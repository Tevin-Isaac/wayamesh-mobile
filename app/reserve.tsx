import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  ActivityIndicator, Alert, Linking, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '@/hooks/useWallet';
import { Eyebrow } from '@/components/pro';
import {
  fetchReserve, fetchWithdrawal, getCachedReserve, depositToReserve,
  requestReserveWithdraw, cancelReserveWithdraw, finalizeReserveWithdraw,
  explorerTxUrl, type WithdrawalState,
} from '@/wallet/meshpay';
import { settlePendingVouchers, countPendingVouchers } from '@/wallet/transactions';
import { WITHDRAW_DELAY_SECONDS, DEFAULT_FEE_UNITS, formatUsdc } from '@/mesh/voucher';
import { COLORS, SPACING, RADIUS, FONTS } from '@/constants/theme';

// Offline reserve: USDC you pre-load into the MeshPayV2 contract so the
// payments you sign offline are provably funded. Receivers can verify it.

function eta(unlockAt: number): string {
  const left = unlockAt - Math.floor(Date.now() / 1000);
  if (left <= 0) return 'ready now';
  const h = Math.floor(left / 3600);
  const m = Math.ceil((left % 3600) / 60);
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}

export default function ReserveScreen() {
  const { address, balance, unlock, refresh: refreshWallet } = useWallet();
  const [reserve, setReserve] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [withdrawal, setWithdrawal] = useState<WithdrawalState | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingVouchers, setPendingVouchers] = useState(0);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!address) return;
    setPendingVouchers(countPendingVouchers());
    const cached = getCachedReserve(address);
    if (cached) { setReserve(cached.amount); setStale(true); }
    try {
      setReserve(await fetchReserve(address));
      setStale(false);
      setWithdrawal(await fetchWithdrawal(address));
    } catch { /* offline — keep cached value, flagged stale */ }
  }, [address]);

  useEffect(() => { load(); }, [load]);

  async function pullRefresh() {
    setRefreshing(true);
    await Promise.all([load(), refreshWallet()]);
    setRefreshing(false);
  }

  async function run(label: string, fn: (w: NonNullable<Awaited<ReturnType<typeof unlock>>>) => Promise<string | void>) {
    setError('');
    setBusy(label);
    try {
      const wallet = await unlock();
      if (!wallet) return;
      const tx = await fn(wallet);
      if (tx) setLastTx(tx);
      setAmount('');
      await Promise.all([load(), refreshWallet()]);
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 160) : `${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  const num = parseFloat(amount || '0');
  const walletBal = balance ? Number(balance) : 0;
  const resNum = reserve ? Number(reserve) : 0;
  const canAdd = num > 0 && num <= walletBal - 0.05 && !busy; // keep a little for gas
  const canWithdraw = num > 0 && num <= resNum && !busy;
  const unlocked = !!withdrawal && withdrawal.unlockAt <= Math.floor(Date.now() / 1000);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullRefresh} tintColor={COLORS.accent} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Eyebrow>Offline reserve</Eyebrow>
          <Text style={styles.big}>${reserve !== null ? Number(reserve).toFixed(2) : '—'}</Text>
          <Text style={styles.sub}>
            {stale ? 'Last known — reconnect to refresh. ' : ''}
            Payments you sign offline are paid from this balance on Arc.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.accent} />
          <Text style={styles.infoText}>
            Because your reserve is held on-chain, anyone you pay can check that it is funded before they accept.
            Each payment also carries a ${formatUsdc(DEFAULT_FEE_UNITS)} courier fee for whichever phone settles it.
          </Text>
        </View>

        {pendingVouchers > 0 && (
          <TouchableOpacity
            style={styles.settleCard}
            activeOpacity={0.85}
            disabled={!!busy}
            onPress={() => run('Settling', async (w) => {
              const r = await settlePendingVouchers(w);
              Alert.alert('Settlement', `${r.settled} settled${r.failed ? `, ${r.failed} still waiting` : ''}.`);
            })}
          >
            <Ionicons name="flash" size={20} color={COLORS.bg} />
            <View style={{ flex: 1 }}>
              <Text style={styles.settleTitle}>Settle {pendingVouchers} payment{pendingVouchers > 1 ? 's' : ''} now</Text>
              <Text style={styles.settleSub}>You earn the courier fee. Needs a connection.</Text>
            </View>
            {busy === 'Settling' && <ActivityIndicator color={COLORS.bg} />}
          </TouchableOpacity>
        )}

        <Eyebrow style={styles.eyebrow}>Amount (USDC)</Eyebrow>
        <View style={styles.inputCard}>
          <Text style={styles.dollar}>$</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, '').slice(0, 10))}
            placeholder="0.00"
            placeholderTextColor={COLORS.textDim}
            keyboardType="decimal-pad"
          />
        </View>
        <Text style={styles.hint}>
          Wallet: ${walletBal.toFixed(2)} · Reserve: ${resNum.toFixed(2)}
        </Text>

        <TouchableOpacity
          style={[styles.cta, !canAdd && styles.ctaOff]}
          disabled={!canAdd}
          activeOpacity={0.85}
          onPress={() => run('Adding', (w) => depositToReserve(w, amount))}
        >
          {busy === 'Adding' ? <ActivityIndicator color={COLORS.bg} /> : <Ionicons name="add-circle-outline" size={18} color={COLORS.bg} />}
          <Text style={styles.ctaText}>Add to reserve</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.ghost, !canWithdraw && styles.ctaOff]}
          disabled={!canWithdraw}
          activeOpacity={0.85}
          onPress={() => run('Requesting', (w) => requestReserveWithdraw(w, amount))}
        >
          <Ionicons name="arrow-down-circle-outline" size={18} color={COLORS.accent} />
          <Text style={styles.ghostText}>Request withdrawal</Text>
        </TouchableOpacity>

        {withdrawal && (
          <View style={styles.withdrawCard}>
            <Text style={styles.withdrawTitle}>Withdrawal pending: ${Number(withdrawal.amount).toFixed(2)}</Text>
            <Text style={styles.withdrawSub}>
              Funds can be finalized {eta(withdrawal.unlockAt)}. The {Math.round(WITHDRAW_DELAY_SECONDS / 3600)}h delay
              protects people you've paid offline — your reserve stays spendable until then.
            </Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.smallBtn, !unlocked && styles.ctaOff]}
                disabled={!unlocked || !!busy}
                onPress={() => run('Finalizing', (w) => finalizeReserveWithdraw(w))}
              >
                <Text style={styles.smallBtnText}>Finalize</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.smallBtn, styles.smallBtnGhost]}
                disabled={!!busy}
                onPress={() => run('Cancelling', (w) => cancelReserveWithdraw(w))}
              >
                <Text style={[styles.smallBtnText, { color: COLORS.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!lastTx && (
          <TouchableOpacity onPress={() => Linking.openURL(explorerTxUrl(lastTx))}>
            <Text style={styles.link}>View last transaction on Arc Explorer →</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.sm, paddingBottom: SPACING.xxl },
  hero: { alignItems: 'center', paddingVertical: SPACING.lg },
  big: { fontFamily: FONTS.mono, fontSize: 46, fontWeight: '700', color: COLORS.text, letterSpacing: -1.5, marginTop: 6 },
  sub: { fontSize: 12.5, color: COLORS.textMuted, textAlign: 'center', marginTop: 6, maxWidth: 300, lineHeight: 18 },
  infoCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: SPACING.md,
    backgroundColor: COLORS.accentSoft, borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(62,217,184,0.25)',
  },
  infoText: { flex: 1, fontSize: 12.5, color: COLORS.textMuted, lineHeight: 18 },
  settleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.md,
    backgroundColor: COLORS.accent, borderRadius: RADIUS.md, marginTop: SPACING.xs,
  },
  settleTitle: { color: COLORS.bg, fontWeight: '700', fontSize: 15 },
  settleSub: { color: COLORS.bg, opacity: 0.75, fontSize: 12, marginTop: 1 },
  eyebrow: { marginTop: SPACING.md },
  inputCard: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
  },
  dollar: { fontFamily: FONTS.mono, fontSize: 22, color: COLORS.textMuted, marginRight: 6 },
  input: { flex: 1, paddingVertical: 14, fontFamily: FONTS.mono, fontSize: 24, color: COLORS.text },
  hint: { fontSize: 12, color: COLORS.textDim, marginBottom: SPACING.sm },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingVertical: 16,
  },
  ctaText: { color: COLORS.bg, fontWeight: '700', fontSize: 16 },
  ctaOff: { opacity: 0.4 },
  ghost: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: RADIUS.md, paddingVertical: 15, borderWidth: 1, borderColor: 'rgba(62,217,184,0.4)',
    backgroundColor: COLORS.accentSoft,
  },
  ghostText: { color: COLORS.accent, fontWeight: '700', fontSize: 15 },
  withdrawCard: {
    padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, gap: 6, marginTop: SPACING.sm,
  },
  withdrawTitle: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  withdrawSub: { color: COLORS.textMuted, fontSize: 12.5, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 10, marginTop: 6 },
  smallBtn: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: RADIUS.md, backgroundColor: COLORS.accent },
  smallBtnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.border },
  smallBtnText: { color: COLORS.bg, fontWeight: '700', fontSize: 14 },
  error: { color: COLORS.error, fontSize: 12.5, marginTop: SPACING.sm },
  link: { color: COLORS.accent, fontSize: 13, marginTop: SPACING.md, textAlign: 'center' },
});
