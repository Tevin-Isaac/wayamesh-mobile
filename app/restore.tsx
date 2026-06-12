import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { restoreFromBackup, readBackup } from '@/wallet/backup';
import { getPinStatus } from '@/wallet/pin';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { COLORS, SPACING } from '@/constants/theme';

function fmtSeconds(s: number): string {
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.ceil(s / 60)}m`;
  return `${Math.ceil(s / 3600)}h`;
}

export default function RestoreScreen() {
  const [pass,        setPass]        = useState('');
  const [show,        setShow]        = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [backupAddr,  setBackupAddr]  = useState<string | null>(null);
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

  async function handleSubmit() {
    if (!pass || loading || !allowed) return;
    setLoading(true);
    setError('');
    try {
      await restoreFromBackup(pass);
      router.replace('/(tabs)');
    } catch (e: unknown) {
      setPass('');
      setError(e instanceof Error ? e.message : 'Restore failed');
      const s = getPinStatus();
      setLockedUntil(s.lockedUntil);
    } finally {
      setLoading(false);
    }
  }

  const remainingSecs = lockedUntil
    ? Math.max(0, lockedUntil - Math.floor(Date.now() / 1000))
    : 0;
  const locked = lockedUntil !== null && remainingSecs > 0;

  const short = backupAddr
    ? `${backupAddr.slice(0, 8)}…${backupAddr.slice(-6)}`
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Restore Wallet</Text>
            {short && (
              <Text style={styles.subtitle}>Backup found for{'\n'}{short}</Text>
            )}
          </View>

          <Input
            label="Backup Passphrase"
            value={pass}
            onChangeText={(t) => { setPass(t); setError(''); }}
            placeholder="Enter your passphrase"
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            editable={!locked}
            containerStyle={styles.field}
            error={!!error && !locked}
            rightSlot={
              <TouchableOpacity onPress={() => setShow(s => !s)} activeOpacity={0.7} style={styles.eye}>
                <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            }
          />

          {locked ? (
            <Text style={styles.lockText}>
              Too many attempts. Try again in {fmtSeconds(remainingSecs)}
            </Text>
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <Text style={styles.hint}>Enter the passphrase you set when backing up.</Text>
          )}

          <Button
            title={loading ? 'Decrypting…' : 'Restore'}
            onPress={handleSubmit}
            disabled={!pass || loading || locked}
            style={styles.submit}
          />

          <TouchableOpacity onPress={() => router.push('/recover')} activeOpacity={0.7}>
            <Text style={styles.altLink}>Forgot passphrase? Recover with guardian shards</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace('/onboarding')} activeOpacity={0.7}>
            <Text style={styles.altLink}>Create a new wallet instead</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  kav:       { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    gap: SPACING.lg,
  },

  header:   { alignItems: 'center', gap: SPACING.sm },
  title:    { fontSize: 26, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 22 },
  hint:     { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },

  field: { marginTop: SPACING.sm },
  eye:   { padding: 4 },

  errorText: { fontSize: 13, color: COLORS.error,   textAlign: 'center' },
  lockText:  { fontSize: 14, color: COLORS.warning, textAlign: 'center', lineHeight: 22 },

  submit: { marginTop: SPACING.sm },

  altLink: {
    fontSize: 13, color: COLORS.textDim, textDecorationLine: 'underline',
    textAlign: 'center',
  },
});
