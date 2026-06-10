import { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useWallet } from '@/hooks/useWallet';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

export default function ImportScreen() {
  const { importExisting, isLoading } = useWallet();
  const [value, setValue] = useState('');

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
        'Your wallet has been restored successfully.',
        [{ text: 'Continue', onPress: () => router.replace('/(tabs)') }],
      );
    } catch {
      Alert.alert('Invalid', 'Could not import wallet. Check your private key or seed phrase and try again.');
    }
  }

  const wordCount = value.trim().split(/\s+/).filter(Boolean).length;
  const isMnemonic = wordCount >= 12;
  const hint = value.trim().startsWith('0x')
    ? 'Private key detected'
    : isMnemonic
    ? `Seed phrase detected (${wordCount} words)`
    : 'Enter your private key (0x…) or 12/24-word seed phrase';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <View style={styles.content}>
          <Text style={styles.description}>
            Restore an existing wallet using its private key or seed phrase. Your key never leaves this device.
          </Text>

          <Text style={styles.label}>Private Key or Seed Phrase</Text>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            placeholder="0x… or word1 word2 word3 …"
            placeholderTextColor={COLORS.textDim}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={false}
            numberOfLines={4}
          />
          <Text style={[styles.hint, value && (isMnemonic || value.startsWith('0x')) && styles.hintActive]}>
            {hint}
          </Text>

          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              Never share your private key or seed phrase with anyone.
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.importBtn, (!value.trim() || isLoading) && styles.disabled]}
            onPress={handleImport}
            disabled={!value.trim() || isLoading}
            activeOpacity={0.85}
          >
            <Text style={styles.importBtnText}>
              {isLoading ? 'Importing...' : 'Import Wallet'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  kav: { flex: 1 },
  content: { flex: 1, padding: SPACING.lg },
  description: {
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 22,
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    color: COLORS.text,
    fontSize: 14,
    fontFamily: 'monospace',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    color: COLORS.textDim,
    marginTop: SPACING.xs,
  },
  hintActive: {
    color: COLORS.accent,
  },
  warningBox: {
    backgroundColor: 'rgba(255, 77, 106, 0.08)',
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 106, 0.2)',
    padding: SPACING.md,
    marginTop: SPACING.lg,
  },
  warningText: {
    fontSize: 13,
    color: COLORS.error,
    lineHeight: 20,
  },
  footer: { padding: SPACING.lg, paddingTop: 0 },
  importBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: COLORS.accent,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  disabled: { opacity: 0.4 },
  importBtnText: {
    color: COLORS.bg,
    fontWeight: '700',
    fontSize: 16,
  },
});
