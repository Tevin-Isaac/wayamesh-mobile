import { useState } from 'react';
import {
  View, Text, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useWallet } from '@/hooks/useWallet';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function ImportScreen() {
  const { importExisting, isLoading } = useWallet();
  const [value, setValue] = useState('');

  const wordCount  = value.trim().split(/\s+/).filter(Boolean).length;
  const isMnemonic = wordCount >= 12;
  const isPk       = value.trim().startsWith('0x') || /^[0-9a-fA-F]{64}$/.test(value.trim());

  const hint = !value.trim()
    ? 'Enter your private key (0x…) or 12/24-word seed phrase'
    : isPk
    ? 'Private key detected'
    : isMnemonic
    ? `Seed phrase detected (${wordCount} words)`
    : `${wordCount} word${wordCount !== 1 ? 's' : ''} — need 12 or 24`;

  const hintActive = !!value.trim() && (isPk || isMnemonic);

  async function handleImport() {
    const trimmed = value.trim();
    if (!trimmed) {
      Alert.alert('Required', 'Enter a private key or seed phrase');
      return;
    }
    try {
      await importExisting(trimmed);
      Alert.alert(
        'Wallet imported',
        'Your wallet has been restored. Set a PIN to protect your cloud backup.',
        [{ text: 'Set PIN', onPress: () => router.replace('/pin-setup') }],
      );
    } catch (e: unknown) {
      Alert.alert('Invalid', e instanceof Error ? e.message : 'Could not import wallet. Check your input and try again.');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
        <View style={styles.content}>
          <Text style={styles.description}>
            Restore an existing wallet using its private key or seed phrase. Your key never leaves this device.
          </Text>

          <Input
            label="Private Key or Seed Phrase"
            value={value}
            onChangeText={setValue}
            placeholder="0x… or word1 word2 word3 …"
            multiline
            numberOfLines={4}
            autoCapitalize="none"
            autoCorrect={false}
            mono
            hint={hint}
            hintActive={hintActive}
            style={styles.textarea}
          />

          <Card tone="error" style={styles.warningCard}>
            <View style={styles.warningRow}>
              <Ionicons name="warning-outline" size={16} color={COLORS.error} />
              <Text style={styles.warningText}>
                Never share your private key or seed phrase with anyone.
              </Text>
            </View>
          </Card>

          <TouchableOpacity
            onPress={() => router.push('/recover')}
            activeOpacity={0.7}
            style={styles.recoverRow}
          >
            <Ionicons name="people-outline" size={16} color={COLORS.accent} />
            <Text style={styles.recoverText}>Lost your key? Recover with guardian shards</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Button
            title={isLoading ? 'Importing…' : 'Import Wallet'}
            onPress={handleImport}
            loading={isLoading}
            disabled={!value.trim() || isLoading}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  kav:       { flex: 1 },
  content:   { flex: 1, padding: SPACING.lg, gap: SPACING.lg },
  description: { fontSize: 14, color: COLORS.textMuted, lineHeight: 22 },
  textarea:  { minHeight: 110, textAlignVertical: 'top', paddingTop: SPACING.md },
  warningCard: { padding: SPACING.md },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  warningText: { flex: 1, fontSize: 13, color: COLORS.error, lineHeight: 20 },
  recoverRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: SPACING.sm },
  recoverText: { fontSize: 13, color: COLORS.accent, textDecorationLine: 'underline' },
  footer: { padding: SPACING.lg, paddingTop: 0 },
});
