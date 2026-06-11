import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Vibration } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { restoreFromBackup, readBackup } from '@/wallet/backup';
import { getPinStatus } from '@/wallet/pin';
import { COLORS, SPACING } from '@/constants/theme';

const PIN_LENGTH = 6;
const PAD_KEYS   = ['1','2','3','4','5','6','7','8','9','','0','⌫'] as const;

function fmtSeconds(s: number): string {
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.ceil(s / 60)}m`;
  return `${Math.ceil(s / 3600)}h`;
}

export default function RestoreScreen() {
  const [pin,     setPin]    = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]  = useState('');
  const [backupAddr, setBackupAddr] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  useEffect(() => {
    readBackup().then(b => { if (b) setBackupAddr(b.address); });
    const s = getPinStatus();
    setLockedUntil(s.lockedUntil);
  }, []);

  // Live countdown while locked
  useEffect(() => {
    if (!lockedUntil) return;
    const id = setInterval(() => {
      if (lockedUntil <= Math.floor(Date.now() / 1000)) {
        setLockedUntil(null);
        setError('');
      }
    }, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const allowed = !lockedUntil || lockedUntil <= Math.floor(Date.now() / 1000);

  const handleComplete = useCallback(async (value: string) => {
    Vibration.vibrate(20);
    setLoading(true);
    try {
      await restoreFromBackup(value);
      router.replace('/(tabs)');
    } catch (e: unknown) {
      setPin('');
      const msg = e instanceof Error ? e.message : 'Restore failed';
      setError(msg);
      // Refresh lockout state
      const s = getPinStatus();
      setLockedUntil(s.lockedUntil);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleKey(key: string) {
    if (!key || loading || !allowed) return;
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

  const remainingSecs = lockedUntil
    ? Math.max(0, lockedUntil - Math.floor(Date.now() / 1000))
    : 0;

  const short = backupAddr
    ? `${backupAddr.slice(0, 8)}…${backupAddr.slice(-6)}`
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>

        <View style={styles.header}>
          <Text style={styles.title}>Restore Wallet</Text>
          {short && (
            <Text style={styles.subtitle}>Backup found for{'\n'}{short}</Text>
          )}
        </View>

        {/* PIN dots */}
        <View style={styles.dots}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
          ))}
        </View>

        {lockedUntil && remainingSecs > 0 ? (
          <Text style={styles.lockText}>
            Too many attempts.{'\n'}Try again in {fmtSeconds(remainingSecs)}
          </Text>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : loading ? (
          <Text style={styles.loadingText}>Decrypting…</Text>
        ) : (
          <Text style={styles.hint}>Enter your PIN to decrypt your wallet</Text>
        )}

        {/* Number pad */}
        <View style={styles.pad}>
          {PAD_KEYS.map((key, i) => (
            <TouchableOpacity
              key={i}
              style={[
                styles.padKey,
                !key && styles.padKeyHidden,
                !allowed && styles.padKeyLocked,
              ]}
              onPress={() => handleKey(key)}
              activeOpacity={key ? 0.65 : 1}
              disabled={!key || loading || !allowed}
            >
              <Text style={[styles.padKeyText, key === '⌫' && styles.padBack]}>
                {key}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity onPress={() => router.replace('/onboarding')} activeOpacity={0.7}>
          <Text style={styles.altLink}>Create a new wallet instead</Text>
        </TouchableOpacity>
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

  header:   { alignItems: 'center', gap: SPACING.sm },
  title:    { fontSize: 26, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 22 },
  hint:     { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },

  dots: { flexDirection: 'row', gap: 20 },
  dot: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: COLORS.border,
  },
  dotFilled: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },

  errorText:   { fontSize: 13, color: COLORS.error,   textAlign: 'center' },
  loadingText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
  lockText:    { fontSize: 14, color: COLORS.warning,  textAlign: 'center', lineHeight: 22 },

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
  padKeyHidden: { backgroundColor: 'transparent', borderColor: 'transparent' },
  padKeyLocked: { opacity: 0.3 },
  padKeyText:   { fontSize: 24, fontWeight: '500', color: COLORS.text },
  padBack:      { fontSize: 20, color: COLORS.textMuted },

  altLink: {
    fontSize: 13, color: COLORS.textDim, textDecorationLine: 'underline',
    textAlign: 'center',
  },
});
