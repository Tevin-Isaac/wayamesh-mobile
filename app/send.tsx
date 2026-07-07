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
import { buildOfflineTransfer } from '@/wallet/transactions';
import { Avatar } from '@/components/pro';
import { getContacts, getContact, type Contact } from '@/db/chat';
import { COLORS, SPACING, RADIUS, FONTS } from '@/constants/theme';

type Phase = 'entry' | 'signing' | 'relaying' | 'done';
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
  const { scannedAddress } = useLocalSearchParams<{ scannedAddress?: string }>();

  const [to, setTo] = useState('');
  const [amt, setAmt] = useState('');
  const [phase, setPhase] = useState<Phase>('entry');
  const [error, setError] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => { if (scannedAddress) setTo(scannedAddress); }, [scannedAddress]);
  useEffect(() => { try { setContacts(getContacts()); } catch { /* db not ready */ } }, []);

  const validTo = ethers.isAddress(to);
  const bal = balance ? Number(balance) : 0;
  const num = parseFloat(amt || '0');
  const insufficient = num > bal - RESERVE && num > 0;
  const ready = num > 0 && !insufficient && validTo;

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
    setPhase('signing');
    setError('');
    try {
      const wallet = await unlock();
      if (!wallet) { setPhase('entry'); return; }
      await buildOfflineTransfer(wallet, to, amt);
      setPhase('relaying');
      setTimeout(() => setPhase('done'), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
      setPhase('entry');
    }
  }

  if (phase !== 'entry') {
    return <SendAnimation phase={phase} amount={num.toFixed(2)} to={to} onDone={() => router.replace('/(tabs)')} />;
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
        <Text style={styles.amountSub}>USDC · {bal.toFixed(2)} available</Text>
        {insufficient && <Text style={styles.amountError}>Insufficient balance</Text>}
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
        <Text style={styles.ctaText}>Sign offline & send</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function SendAnimation({ phase, amount, to, onDone }: { phase: Phase; amount: string; to: string; onDone: () => void }) {
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
            <Ionicons name="radio-outline" size={15} color={COLORS.accent} />
            <Text style={styles.relayPillText}>Relaying over mesh</Text>
          </View>
          <Text style={styles.successNote}>Signed offline — it settles on Arc the moment you reconnect.</Text>
        </View>
        <TouchableOpacity style={styles.cta} onPress={onDone} activeOpacity={0.85}>
          <Text style={styles.ctaText}>Done</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const label = phase === 'signing' ? 'Signing offline' : 'Relaying over mesh';
  const sub = phase === 'signing' ? 'Securing with your on-device key' : 'Hopping peer-to-peer via Bluetooth';
  const icon = phase === 'signing' ? 'lock-closed' : 'radio';
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
