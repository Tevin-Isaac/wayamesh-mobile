import { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Vibration } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useWallet } from '@/hooks/useWallet';
import { saveBackup } from '@/wallet/backup';
import { getWallet } from '@/db/queries';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

const PIN_LENGTH = 6;
const PAD_KEYS   = ['1','2','3','4','5','6','7','8','9','','0','⌫'] as const;

type Phase = 'create' | 'confirm';

export default function PinSetupScreen() {
  const { address } = useWallet();
  const [phase,    setPhase]   = useState<Phase>('create');
  const [pin,      setPin]     = useState('');
  const [error,    setError]   = useState('');
  const [loading,  setLoading] = useState(false);
  const firstPin = useRef('');

  const handleComplete = useCallback(async (value: string) => {
    Vibration.vibrate(20);
    if (phase === 'create') {
      firstPin.current = value;
      setPin('');
      setPhase('confirm');
      return;
    }
    if (value !== firstPin.current) {
      setPin('');
      setError('PINs do not match — try again');
      setPhase('create');
      firstPin.current = '';
      return;
    }
    setLoading(true);
    try {
      // Read address directly from SQLite — avoids async hook timing race
      const walletRow = getWallet();
      const walletAddress = address ?? walletRow?.address;
      if (!walletAddress) throw new Error('Wallet not found — please try again');
      await saveBackup(walletAddress, value);
      router.replace('/(tabs)');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Backup failed — try again');
      setPin('');
    } finally {
      setLoading(false);
    }
  // phase is captured in the closure; pin state drives re-render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, address]);

  function handleKey(key: string) {
    if (!key || loading) return;
    if (key === '⌫') {
      setPin(p => p.slice(0, -1));
      setError('');
      return;
    }
    setPin(p => {
      if (p.length >= PIN_LENGTH) return p;
      const next = p + key;
      if (next.length === PIN_LENGTH) {
        setTimeout(() => handleComplete(next), 60);
      }
      return next;
    });
    setError('');
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>

        <View style={styles.header}>
          <Text style={styles.title}>
            {phase === 'create' ? 'Create PIN' : 'Confirm PIN'}
          </Text>
          <Text style={styles.subtitle}>
            {phase === 'create'
              ? 'Your 6-digit PIN encrypts your wallet backup'
              : 'Re-enter your PIN to confirm'}
          </Text>
        </View>

        {/* Dot indicators */}
        <View style={styles.dots}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
          ))}
        </View>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : loading ? (
          <Text style={styles.loadingText}>Encrypting…</Text>
        ) : null}

        {/* Number pad */}
        <View style={styles.pad}>
          {PAD_KEYS.map((key, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.padKey, !key && styles.padKeyHidden]}
              onPress={() => handleKey(key)}
              activeOpacity={key ? 0.65 : 1}
              disabled={!key || loading}
            >
              <Text style={[styles.padKeyText, key === '⌫' && styles.padBack]}>
                {key}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.securityNote}>
          Encrypted with AES-256 via scrypt · backed up to your cloud storage
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xl,
  },

  header: { alignItems: 'center', gap: SPACING.sm },
  title:  { fontSize: 26, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  subtitle: {
    fontSize: 14, color: COLORS.textMuted,
    textAlign: 'center', lineHeight: 22,
  },

  dots: { flexDirection: 'row', gap: 20 },
  dot: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: COLORS.border,
  },
  dotFilled: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },

  errorText:   { fontSize: 13, color: COLORS.error,    textAlign: 'center' },
  loadingText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },

  pad: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 14,
  },
  padKey: {
    width: 82, height: 82, borderRadius: 41,
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  padKeyHidden: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  padKeyText: { fontSize: 24, fontWeight: '500', color: COLORS.text },
  padBack:    { fontSize: 20, color: COLORS.textMuted },

  securityNote: {
    fontSize: 11, color: COLORS.textDim,
    textAlign: 'center', lineHeight: 18,
  },
});
