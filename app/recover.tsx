import { useState } from 'react';
import {
  View, Text, StyleSheet, Alert, ScrollView,
  KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { recoverFromPayloads } from '@/wallet/sss';
import { useWallet } from '@/hooks/useWallet';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { COLORS, SPACING } from '@/constants/theme';

export default function RecoverScreen() {
  const { importExisting } = useWallet();
  const [shards, setShards] = useState<string[]>(['', '']);
  const [error,  setError]  = useState('');
  const [loading, setLoading] = useState(false);

  const filled = shards.filter(s => s.trim()).length;
  const canSubmit = filled >= 2 && !loading;

  function updateShard(i: number, text: string) {
    setShards(prev => prev.map((s, idx) => (idx === i ? text : s)));
    setError('');
  }

  function addThird() {
    if (shards.length < 3) setShards(prev => [...prev, '']);
  }

  async function handleRecover() {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      const privateKey = recoverFromPayloads(shards);
      await importExisting(privateKey);
      Alert.alert(
        'Wallet recovered',
        'Your guardians reconstructed your wallet. Set a backup passphrase to protect it on this device.',
        [{ text: 'Set passphrase', onPress: () => router.replace('/pin-setup') }],
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Recovery failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Recover with Guardians</Text>
          <Text style={styles.subtitle}>
            Paste any 2 of your 3 guardian shards. Together they rebuild your
            wallet's key on this device — no single shard reveals anything.
          </Text>

          {shards.map((shard, i) => (
            <Input
              key={i}
              label={`Shard ${i + 1}`}
              value={shard}
              onChangeText={(t) => updateShard(i, t)}
              placeholder='{"v":1,"i":…}'
              multiline
              numberOfLines={3}
              autoCapitalize="none"
              autoCorrect={false}
              mono
              containerStyle={styles.field}
              style={styles.textarea}
            />
          ))}

          {shards.length < 3 && (
            <TouchableOpacity onPress={addThird} activeOpacity={0.7} style={styles.addRow}>
              <Ionicons name="add-circle-outline" size={18} color={COLORS.accent} />
              <Text style={styles.addText}>Add a third shard</Text>
            </TouchableOpacity>
          )}

          {error ? (
            <Card tone="error" style={styles.errorCard}>
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle-outline" size={16} color={COLORS.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            </Card>
          ) : null}

          <Text style={styles.note}>
            Recovery produces a private-key wallet (no seed phrase). After
            recovering, consider moving funds to a fresh wallet for a clean seed.
          </Text>
        </ScrollView>

        <View style={styles.footer}>
          <Button
            title={loading ? 'Recovering…' : 'Recover Wallet'}
            onPress={handleRecover}
            loading={loading}
            disabled={!canSubmit}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  kav:       { flex: 1 },
  content:   { padding: SPACING.lg, gap: SPACING.md },

  title:    { fontSize: 24, fontWeight: '700', color: COLORS.text, marginTop: SPACING.sm },
  subtitle: { fontSize: 14, color: COLORS.textMuted, lineHeight: 22, marginBottom: SPACING.sm },

  field:    { marginTop: SPACING.xs },
  textarea: { minHeight: 80, textAlignVertical: 'top', paddingTop: SPACING.sm },

  addRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: SPACING.xs },
  addText: { fontSize: 14, color: COLORS.accent, fontWeight: '500' },

  errorCard: { padding: SPACING.md },
  errorRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  errorText: { flex: 1, fontSize: 13, color: COLORS.error, lineHeight: 20 },

  note: { fontSize: 12, color: COLORS.textDim, lineHeight: 18, marginTop: SPACING.xs },

  footer: { padding: SPACING.lg, paddingTop: 0 },
});
