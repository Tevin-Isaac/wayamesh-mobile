import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Animated, Easing, ScrollView,
} from 'react-native';
import { useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import { useWallet } from '@/hooks/useWallet';
import { sendPayment, planPayment, type PayMode } from '@/wallet/pay';
import { Avatar } from '@/components/pro';
import { getContacts, getContact, type Contact } from '@/db/chat';
import { COLORS, SPACING, RADIUS, FONTS } from '@/constants/theme';
import { groupAddress, lookalike, safeDecimal, unsafeRecipient } from '@/utils/safety';
import { VOUCHER_TTL_SECONDS } from '@/mesh/voucher';
import { exact6 } from '@/utils/money';

type Phase = 'entry' | 'review' | 'signing' | 'relaying' | 'done';
const RESERVE = 0.0001; // tiny gas reserve

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'] as const;

function Keypad({ onKey }: { onKey: (k: string) => void }) {
  return (
    <View style={styles.keypad}>
      {KEYS.map((k) => (
        <TouchableOpacity key={k} style={styles.key} activeOpacity={0.6} onPress={() => onKey(k)}>
          {k === 'del'
            ? <Ionicons name="backspace-outline" size={24} color={COLORS.textMuted} />
            : <Text style={styles.keyText}>{k}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function SendScreen() {
  const { address, balance, unlock } = useWallet();
  const { scannedAddress, amount: presetAmount, ref: presetRef } = useLocalSearchParams<{ scannedAddress?: string; amount?: string; ref?: string }>();
  // A payment request from chat prefills the amount and carries its invoice reference inside the signed voucher.
  const invoiceRef = typeof presetRef === 'string' && /^0x[0-9a-fA-F]{64}$/.test(presetRef) ? presetRef : undefined;

  const [to, setTo] = useState('');
  const [amt, setAmt] = useState('');
  const [phase, setPhase] = useState<Phase>('entry');
  const [error, setError] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [txHash, setTxHash] = useState('');
  const [sentMode, setSentMode] = useState<PayMode>('direct');

  useEffect(() => { if (scannedAddress) setTo(scannedAddress); }, [scannedAddress]);
  useEffect(() => { if (presetAmount && safeDecimal(presetAmount)) setAmt(presetAmount); }, [presetAmount]);
  useEffect(() => { try { setContacts(getContacts()); } catch { /* db not ready */ } }, []);

  const validTo = ethers.isAddress(to);
  const bal = balance ? Number(balance) : 0;
  const num = parseFloat(amt || '0');
  const plan = planPayment(address, amt);
  const reserveNum = plan.reserve ? Number(plan.reserve) : 0;
  const feeNum = Number(plan.fee);
  // Voucher mode spends from the offline reserve; otherwise from the wallet balance.
  const available = plan.mode === 'voucher' ? reserveNum - feeNum : bal - RESERVE;
  // A balance we could not read is UNKNOWN, not zero: say so, and don't send a plain transfer we cannot check.
  const balanceUnknown = plan.mode === 'direct' && balance === null;
  const insufficient = !balanceUnknown && num > available && num > 0;
  const unsafe = validTo ? unsafeRecipient(to) : null;
  const similar = validTo ? lookalike(to, contacts.map((c) => c.address)) : null;
  const ready = num > 0 && !insufficient && !balanceUnknown && validTo && !unsafe;

  function key(k: string) {
    setError('');
    setAmt((prev) => {
      if (k === 'del') return prev.slice(0, -1);
      if (k === '.' && prev.includes('.')) return prev;
      if (k === '.' && prev === '') return '0.';
      if (prev.includes('.') && prev.split('.')[1].length >= 2) return prev;
      if (prev === '0' && k !== '.') return k;
      return (prev + k).slice(0, 9);
    });
  }

  async function go() {
    if (!ready) return;
    if (phase === 'entry') { setPhase('review'); return; } // review before signing
    setPhase('signing');
    setError('');
    try {
      const wallet = await unlock();
      if (!wallet) { setPhase('entry'); return; }
      const res = await sendPayment(wallet, to, amt, { ref: invoiceRef });
      setSentMode(res.mode);
      setTxHash(res.hash);
      setPhase('relaying');
      setTimeout(() => setPhase('done'), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
      setPhase('entry');
    }
  }

  if (phase === 'review') {
    const contact = getContact(to);
    const expiry = new Date(Date.now() + VOUCHER_TTL_SECONDS * 1000);
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setPhase('entry')} activeOpacity={0.7}><Ionicons name="chevron-back" size={24} color={COLORS.textMuted} /></TouchableOpacity>
          <Text style={styles.headerTitle}>Review before signing</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView contentContainerStyle={{ gap: SPACING.md, paddingBottom: SPACING.lg }}>
          <View style={styles.toCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toLabel}>TO {contact ? `· ${contact.name}` : '· NOT IN YOUR CONTACTS'}</Text>
              <Text style={styles.reviewAddr}>{groupAddress(ethers.getAddress(to))}</Text>
              <Text style={styles.reviewNote}>Check every group against what the recipient told you.</Text>
            </View>
          </View>
          {similar ? (
            <View style={styles.warnBox}>
              <Text style={styles.warnText}>Look-alike address. This is NOT your saved contact, but it starts and ends the same as {similar}. This is a common scam. Go back unless you are sure.</Text>
            </View>
          ) : null}
          <View style={styles.toCard}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.reviewRow}>Amount: ${num.toFixed(2)} USDC</Text>
              <Text style={styles.reviewRow}>{plan.mode === 'voucher' ? `Courier fee: $${plan.fee} (paid from your reserve to whoever settles it)` : 'Courier fee: none (plain transfer from your wallet)'}</Text>
              <Text style={styles.reviewRow}>{plan.mode === 'voucher' ? `Valid until ${expiry.toLocaleString()}` : 'Settles when a phone is online'}</Text>
              {invoiceRef ? <Text style={styles.reviewNote}>Pays invoice {invoiceRef.slice(0, 10)}...</Text> : null}
              <Text style={styles.reviewNote}>Offline payments are provisional until they settle. Only pay people you would trust with this amount.</Text>
            </View>
          </View>
          {!!error && <Text style={styles.amountError}>{error}</Text>}
        </ScrollView>
        <TouchableOpacity style={styles.cta} onPress={go} activeOpacity={0.85}>
          <Ionicons name="lock-closed" size={16} color={COLORS.bg} />
          <Text style={styles.ctaText}>Confirm and sign</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (phase !== 'entry') {
    return <SendAnimation phase={phase} amount={num.toFixed(2)} to={to} txHash={txHash} mode={sentMode} onDone={() => router.replace('/(tabs)')} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}><Ionicons name="close" size={24} color={COLORS.textMuted} /></TouchableOpacity>
        <Text style={styles.headerTitle}>Send USDC</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* recipient */}
      {validTo ? (
        <View style={styles.toCard}>
          <Avatar seed={getContact(to)?.name ?? to} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={styles.toLabel}>TO</Text>
            <Text style={styles.toValue}>
              {getContact(to)?.name ?? `${to.slice(0, 10)}…${to.slice(-8)}`}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setTo('')} activeOpacity={0.7}><Ionicons name="close-circle" size={20} color={COLORS.textDim} /></TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.toInputCard}>
            <TextInput
              style={styles.toInput}
              value={to}
              onChangeText={setTo}
              placeholder="Recipient address (0x…)"
              placeholderTextColor={COLORS.textDim}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={() => router.push('/scan')} activeOpacity={0.7} style={styles.scanBtn}>
              <Ionicons name="qr-code-outline" size={22} color={COLORS.accent} />
            </TouchableOpacity>
          </View>
          {contacts.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={styles.chipsInner}>
              {contacts.map((c) => (
                <TouchableOpacity key={c.address} style={styles.chip} activeOpacity={0.7} onPress={() => setTo(c.address)}>
                  <Avatar seed={c.name} size={30} />
                  <Text style={styles.chipName} numberOfLines={1}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </>
      )}

      {/* amount */}
      <View style={styles.amountArea}>
        <View style={styles.amountRow}>
          <Text style={styles.amountSymbol}>$</Text>
          <Text style={[styles.amountValue, !amt && styles.amountValueDim]}>{amt || '0'}</Text>
        </View>
        <Text style={styles.amountSub}>
          {plan.mode === 'voucher'
            ? `USDC · $${exact6(plan.reserve ?? '0')} in offline reserve · $${plan.fee} courier fee`
            : `USDC · ${balance !== null ? exact6(balance) : '—'} in wallet${reserveNum > 0 ? ' (reserve too low for this amount)' : ''}`}
        </Text>
        {insufficient && <Text style={styles.amountError}>Insufficient balance</Text>}
        {balanceUnknown && num > 0 && (
          <Text style={styles.amountError}>Can’t read your balance right now. Reconnect, or pay from your offline reserve.</Text>
        )}
        {!!unsafe && <Text style={styles.amountError}>{unsafe}</Text>}
        {!!error && <Text style={styles.amountError}>{error}</Text>}
      </View>

      <Keypad onKey={key} />

      <TouchableOpacity
        style={[styles.cta, !ready && styles.ctaOff]}
        onPress={go}
        disabled={!ready}
        activeOpacity={0.85}
      >
        <Ionicons name="lock-closed" size={16} color={COLORS.bg} />
        <Text style={styles.ctaText}>Review</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function SendAnimation({ phase, amount, to, txHash, mode, onDone }: { phase: Phase; amount: string; to: string; txHash: string; mode: PayMode; onDone: () => void }) {
  const breathe = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (phase === 'done') return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1.08, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [phase]);

  const shortTo = `${to.slice(0, 6)}…${to.slice(-4)}`;

  if (phase === 'done') {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.animCenter}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark" size={42} color={COLORS.bg} />
          </View>
          <Text style={styles.successAmount}>${amount}</Text>
          <Text style={styles.successSub}>sent to <Text style={styles.successWho}>{shortTo}</Text></Text>
          <View style={styles.relayPill}>
            <Ionicons name="flash-outline" size={15} color={COLORS.accent} />
            <Text style={styles.relayPillText}>Signed offline</Text>
          </View>
          <Text style={styles.successNote}>
            {mode === 'voucher'
              ? 'Backed by your on-chain reserve, so the receiver can verify it is funded. Whichever phone gets online first settles it and keeps the small courier fee.'
              : 'Settles on Arc the moment you reconnect. Hand it over by QR to let the receiver settle it first.'}
          </Text>
        </View>
        {!!txHash && (
          <TouchableOpacity
            style={styles.handoffBtn}
            onPress={() => router.replace({ pathname: '/payment-qr', params: { hash: txHash } })}
            activeOpacity={0.85}
          >
            <Ionicons name="qr-code-outline" size={17} color={COLORS.accent} />
            <Text style={styles.handoffText}>Hand to receiver via QR</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.cta} onPress={onDone} activeOpacity={0.85}>
          <Text style={styles.ctaText}>Done</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const label = phase === 'signing' ? 'Signing offline' : 'Queued to settle';
  const sub = phase === 'signing' ? 'Securing with your on-device key' : 'Settles on Arc the moment you reconnect';
  const icon = phase === 'signing' ? 'lock-closed' : 'flash';
  const stepIndex = ['signing', 'relaying', 'done'].indexOf(phase);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.animCenter}>
        <Animated.View style={[styles.breatheCircle, { transform: [{ scale: breathe }] }]}>
          <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={28} color={COLORS.accent} />
        </Animated.View>
        <Text style={styles.animAmount}>${amount}</Text>
        <Text style={styles.animLabel}>{label}</Text>
        <Text style={styles.animSub}>{sub}</Text>
        <View style={styles.steps}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.step, i <= stepIndex && styles.stepOn]} />
          ))}
        </View>
        {phase === 'signing' && <ActivityIndicator color={COLORS.accent} style={{ marginTop: SPACING.lg }} />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: SPACING.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.md },
  headerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },

  toCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginTop: SPACING.sm,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
  },
  toLabel: { fontSize: 11, color: COLORS.textDim, letterSpacing: 1 },
  toValue: { fontSize: 15, fontWeight: '600', color: COLORS.text, fontFamily: FONTS.mono },
  toInputCard: {
    flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
  },
  toInput: { flex: 1, paddingVertical: 14, color: COLORS.text, fontSize: 15, fontFamily: FONTS.mono },
  scanBtn: { paddingLeft: SPACING.sm, paddingVertical: 8 },

  chips: { marginTop: SPACING.sm, maxHeight: 44, flexGrow: 0 },
  chipsInner: { gap: SPACING.sm, paddingRight: SPACING.md },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingLeft: 6, paddingRight: 14, paddingVertical: 6,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  chipName: { fontSize: 13, color: COLORS.text, fontWeight: '500', maxWidth: 110 },

  reviewAddr: { fontFamily: FONTS.mono, fontSize: 15, color: COLORS.text, lineHeight: 24, marginTop: 4 },
  reviewRow: { color: COLORS.text, fontSize: 14 },
  reviewNote: { color: COLORS.textDim, fontSize: 12, lineHeight: 18, marginTop: 4 },
  warnBox: { backgroundColor: COLORS.warningSoft, borderWidth: 1, borderColor: COLORS.warning, borderRadius: RADIUS.md, padding: SPACING.md },
  warnText: { color: COLORS.warning, fontSize: 13, lineHeight: 19 },
  amountArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline' },
  amountSymbol: { fontFamily: FONTS.mono, fontSize: 30, color: COLORS.textMuted, marginRight: 4 },
  amountValue: { fontFamily: FONTS.mono, fontSize: 56, fontWeight: '700', color: COLORS.text, letterSpacing: -1 },
  amountValueDim: { color: COLORS.textDim },
  amountSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 8 },
  amountError: { fontSize: 12, color: COLORS.error, marginTop: 6 },

  keypad: { flexDirection: 'row', flexWrap: 'wrap' },
  key: { width: '33.33%', height: 60, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontFamily: FONTS.mono, fontSize: 24, color: COLORS.text },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingVertical: 18, marginTop: SPACING.md, marginBottom: SPACING.sm,
    shadowColor: COLORS.accent, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  ctaOff: { opacity: 0.4 },
  ctaText: { color: COLORS.bg, fontWeight: '700', fontSize: 17 },
  handoffBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: RADIUS.md, paddingVertical: 15,
    borderWidth: 1, borderColor: 'rgba(62,217,184,0.4)', backgroundColor: COLORS.accentSoft,
  },
  handoffText: { color: COLORS.accent, fontWeight: '700', fontSize: 15 },

  // animation
  animCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  breatheCircle: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.accentSoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg,
  },
  animAmount: { fontFamily: FONTS.mono, fontSize: 34, fontWeight: '700', color: COLORS.text, letterSpacing: -1 },
  animLabel: { fontSize: 17, fontWeight: '600', color: COLORS.text, marginTop: SPACING.md },
  animSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 6, textAlign: 'center', maxWidth: 240 },
  steps: { flexDirection: 'row', gap: 6, marginTop: SPACING.lg },
  step: { width: 28, height: 3, borderRadius: 2, backgroundColor: COLORS.border },
  stepOn: { backgroundColor: COLORS.accent },

  successCircle: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg,
    shadowColor: COLORS.accent, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  successAmount: { fontFamily: FONTS.mono, fontSize: 46, fontWeight: '700', color: COLORS.text, letterSpacing: -1.5 },
  successSub: { fontSize: 15, color: COLORS.textMuted, marginTop: 10 },
  successWho: { color: COLORS.text, fontWeight: '600', fontFamily: FONTS.mono },
  relayPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SPACING.lg,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.full,
    backgroundColor: COLORS.accentSoft, borderWidth: 1, borderColor: 'rgba(62,217,184,0.3)',
  },
  relayPillText: { fontSize: 13, color: COLORS.accent, fontWeight: '600' },
  successNote: { fontSize: 13, color: COLORS.textDim, marginTop: SPACING.md, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
});
