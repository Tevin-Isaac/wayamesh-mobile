import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '@/hooks/useWallet';
import { saveBackup } from '@/wallet/backup';
import { getWallet } from '@/db/queries';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { COLORS, SPACING } from '@/constants/theme';

const MIN_LENGTH = 8;

// Cheap, dependency-free strength heuristic — enough to nudge users past the
// trivially-brute-forceable range for an off-device backup file.
function strength(pass: string): { label: string; color: string; ok: boolean } {
  if (pass.length < MIN_LENGTH) return { label: `At least ${MIN_LENGTH} characters`, color: COLORS.textDim, ok: false };
  let score = 0;
  if (pass.length >= 12) score++;
  if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) score++;
  if (/\d/.test(pass)) score++;
  if (/[^A-Za-z0-9]/.test(pass)) score++;
  if (score <= 1) return { label: 'Weak — add length or symbols', color: COLORS.warning, ok: true };
  if (score === 2) return { label: 'Okay', color: COLORS.warning, ok: true };
  if (score === 3) return { label: 'Strong', color: COLORS.accent, ok: true };
  return { label: 'Very strong', color: COLORS.accent, ok: true };
}

export default function PassphraseSetupScreen() {
  const { address } = useWallet();
  const [pass,    setPass]    = useState('');
  const [confirm, setConfirm] = useState('');
  const [show,    setShow]    = useState(false);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const str       = strength(pass);
  const matches   = confirm.length > 0 && pass === confirm;
  const canSubmit = str.ok && matches && !loading;

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      const walletRow = getWallet();
      const walletAddress = address ?? walletRow?.address;
      if (!walletAddress) throw new Error('Wallet not found — please try again');
      await saveBackup(walletAddress, pass);
      router.replace('/(tabs)');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Backup failed — try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>Backup Passphrase</Text>
            <Text style={styles.subtitle}>
              This passphrase encrypts your wallet backup. Choose something strong
              you can remember — it's the only way to restore if you lose this device.
            </Text>
          </View>

          <Input
            label="Passphrase"
            value={pass}
            onChangeText={(t) => { setPass(t); setError(''); }}
            placeholder="Enter a passphrase"
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            textContentType="newPassword"
            containerStyle={styles.field}
            hint={pass.length > 0 ? str.label : `At least ${MIN_LENGTH} characters`}
            hintActive={str.ok}
            rightSlot={
              <TouchableOpacity onPress={() => setShow(s => !s)} activeOpacity={0.7} style={styles.eye}>
                <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            }
          />

          <Input
            label="Confirm Passphrase"
            value={confirm}
            onChangeText={(t) => { setConfirm(t); setError(''); }}
            placeholder="Re-enter passphrase"
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            textContentType="newPassword"
            containerStyle={styles.field}
            error={confirm.length > 0 && !matches}
            hint={confirm.length > 0 ? (matches ? '✓ Matches' : 'Does not match') : undefined}
            hintActive={matches}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Text style={styles.securityNote}>
            Encrypted with AES-256 via scrypt · stored only on your device's backup.
            We never see your passphrase and cannot reset it.
          </Text>
        </ScrollView>

        <Button
          title={loading ? 'Encrypting…' : 'Save Backup'}
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={styles.submit}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  kav:       { flex: 1 },
  content:   { padding: SPACING.lg, gap: SPACING.md },

  header:   { gap: SPACING.sm, marginBottom: SPACING.sm, marginTop: SPACING.lg },
  title:    { fontSize: 26, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.textMuted, lineHeight: 22 },

  field: { marginTop: SPACING.xs },
  eye:   { padding: 4 },

  errorText: { fontSize: 13, color: COLORS.error },

  securityNote: {
    fontSize: 12, color: COLORS.textDim, lineHeight: 18, marginTop: SPACING.sm,
  },
  submit: { margin: SPACING.lg },
});
