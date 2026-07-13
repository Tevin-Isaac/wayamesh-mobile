import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/pro';
import { useWallet } from '@/hooks/useWallet';
import { decodeEnvelope, type DecodedEnvelope } from '@/mesh/envelope';
import { ingestEnvelope, type IngestRole } from '@/mesh/ingest';
import { tipCourier, COURIER_TIP_USDC, type TipOutcome } from '@/mesh/courier';
import { getContact } from '@/db/chat';
import { COLORS, SPACING, RADIUS, FONTS } from '@/constants/theme';

// The receiver's half of an offline handoff: preview a scanned payment
// envelope, accept it, and hold it until this phone can settle it on Arc.

export default function ReceivePaymentScreen() {
  const { payload } = useLocalSearchParams<{ payload: string }>();
  const { address, unlock } = useWallet();
  const [accepted, setAccepted] = useState<IngestRole | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [tip, setTip] = useState<TipOutcome | null>(null);
  const [error, setError] = useState('');

  const env: DecodedEnvelope | null = useMemo(() => {
    try { return payload ? decodeEnvelope(payload) : null; } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid payment code');
      return null;
    }
  }, [payload]);

  const forMe = !!env && !!address && env.to.toLowerCase() === address.toLowerCase();
  const fromName = env ? (getContact(env.from.toLowerCase())?.name ?? `${env.from.slice(0, 8)}…${env.from.slice(-6)}`) : '';

  async function accept() {
    if (!env || !payload) return;
    try {
      const res = ingestEnvelope(payload, address, 'qr');
      if (res.status === 'duplicate') setDuplicate(true);
      setAccepted(res.role);
      // Mesh economics: if a courier delivered this to its recipient, the
      // recipient's agent tips them — inside the mandate envelope, offline.
      if (res.status === 'accepted' && res.role === 'recipient' && env.courier) {
        const wallet = await unlock();
        if (wallet) setTip(await tipCourier(wallet, env.courier));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not accept payment');
    }
  }

  // ── invalid ──────────────────────────────────────────────────────────────
  if (!env) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.center}>
          <View style={[styles.bigCircle, styles.bigCircleError]}>
            <Ionicons name="alert" size={40} color={COLORS.error} />
          </View>
          <Text style={styles.title}>Invalid payment</Text>
          <Text style={styles.sub}>{error}</Text>
        </View>
        <TouchableOpacity style={styles.cta} onPress={() => router.back()} activeOpacity={0.85}>
          <Text style={styles.ctaText}>Close</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── accepted ─────────────────────────────────────────────────────────────
  if (accepted) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.center}>
          <View style={styles.bigCircle}>
            <Ionicons name="checkmark" size={42} color={COLORS.bg} />
          </View>
          <Text style={styles.amount}>${Number(env.amount).toFixed(2)}</Text>
          <Text style={styles.sub}>
            {duplicate ? 'You already hold this payment.'
              : accepted === 'recipient'
                ? `from ${fromName} — it's yours`
                : 'You are now carrying this payment'}
          </Text>
          <View style={styles.pill}>
            <Ionicons name="flash-outline" size={15} color={COLORS.accent} />
            <Text style={styles.pillText}>Settles on Arc when this phone is online</Text>
          </View>
          {tip?.status === 'tipped' && (
            <View style={styles.pill}>
              <Ionicons name="sparkles-outline" size={15} color={COLORS.accent} />
              <Text style={styles.pillText}>Your agent tipped the courier {tip.amount} USDC</Text>
            </View>
          )}
          {tip?.status === 'denied' && (
            <Text style={styles.tipDenied}>Courier tip blocked by your mandate — {tip.reason}</Text>
          )}
          <Text style={styles.note}>
            You hold the signed transaction now — the sender doesn't need to
            reconnect. No one can alter or cancel it once it settles.
          </Text>
        </View>
        <TouchableOpacity style={styles.cta} onPress={() => router.replace('/(tabs)')} activeOpacity={0.85}>
          <Text style={styles.ctaText}>Done</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── preview ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Avatar seed={fromName} size={64} dir="in" />
        <Text style={styles.amount}>${Number(env.amount).toFixed(2)}</Text>
        <Text style={styles.sub}>from <Text style={styles.mono}>{fromName}</Text></Text>

        {!forMe && (
          <View style={styles.warnCard}>
            <Ionicons name="swap-horizontal-outline" size={18} color={COLORS.warning} />
            <Text style={styles.warnText}>
              This payment is addressed to{' '}
              <Text style={styles.mono}>{`${env.to.slice(0, 8)}…${env.to.slice(-6)}`}</Text>, not
              to this wallet. You can still carry it — it will settle to them
              when you're online (mesh courier).
            </Text>
          </View>
        )}

        <View style={styles.factCard}>
          <Fact label="Verified sender" value={`${env.from.slice(0, 10)}…${env.from.slice(-8)}`} />
          <Fact label="Recipient" value={`${env.to.slice(0, 10)}…${env.to.slice(-8)}`} />
          <Fact label="Network" value={`Arc · chain ${env.chainId}`} />
          <Fact label="Signature" value="Valid — amount & recipient sealed" />
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.cta} onPress={accept} activeOpacity={0.85}>
        <Ionicons name={forMe ? 'download-outline' : 'git-branch-outline'} size={17} color={COLORS.bg} />
        <Text style={styles.ctaText}>{forMe ? 'Accept payment' : 'Carry & relay'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.decline} onPress={() => router.back()} activeOpacity={0.7}>
        <Text style={styles.declineText}>Decline</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: SPACING.lg },
  content: { alignItems: 'center', paddingTop: SPACING.xl, paddingBottom: SPACING.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.md },

  amount: { fontFamily: FONTS.mono, fontSize: 46, fontWeight: '700', color: COLORS.text, letterSpacing: -1.5, marginTop: SPACING.md },
  title: { fontSize: 19, fontWeight: '700', color: COLORS.text, marginTop: SPACING.md },
  sub: { fontSize: 14, color: COLORS.textMuted, marginTop: 8, textAlign: 'center' },
  mono: { fontFamily: FONTS.mono, color: COLORS.text },

  bigCircle: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.accent, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  bigCircleError: { backgroundColor: COLORS.errorSoft, shadowOpacity: 0 },

  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SPACING.lg,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.full,
    backgroundColor: COLORS.accentSoft, borderWidth: 1, borderColor: 'rgba(62,217,184,0.3)',
  },
  pillText: { fontSize: 13, color: COLORS.accent, fontWeight: '600' },
  note: { fontSize: 13, color: COLORS.textDim, marginTop: SPACING.md, textAlign: 'center', maxWidth: 280, lineHeight: 20 },

  warnCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: SPACING.lg,
    backgroundColor: COLORS.warningSoft, borderWidth: 1, borderColor: 'rgba(245,166,35,0.3)',
    borderRadius: RADIUS.md, padding: SPACING.md,
  },
  warnText: { flex: 1, fontSize: 12, color: COLORS.warning, lineHeight: 18 },
  tipDenied: { fontSize: 12, color: COLORS.textDim, marginTop: SPACING.sm, textAlign: 'center' },

  factCard: {
    width: '100%', marginTop: SPACING.lg,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 4,
  },
  factRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, gap: 12 },
  factLabel: { fontSize: 12, color: COLORS.textMuted },
  factValue: { fontSize: 12, color: COLORS.text, fontFamily: FONTS.mono, flexShrink: 1 },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingVertical: 17, marginTop: SPACING.sm,
    shadowColor: COLORS.accent, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  ctaText: { color: COLORS.bg, fontWeight: '700', fontSize: 16 },
  decline: { alignItems: 'center', paddingVertical: 14, marginBottom: SPACING.xs },
  declineText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },
});
