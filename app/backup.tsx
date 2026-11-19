import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput,
} from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ScreenCapture from 'expo-screen-capture';
import { Ionicons } from '@expo/vector-icons';
import { loadMnemonic } from '@/wallet/keystore';
import { copyWithAutoClear } from '@/utils/clipboard';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

export default function BackupScreen() {
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [hidden, setHidden]     = useState(true);
  // First-run mode (right after Create Wallet): the user must see the phrase and prove they wrote it down.
  const { first } = useLocalSearchParams<{ first?: string }>();
  const firstRun = first === '1';
  const [step, setStep] = useState<'show' | 'confirm'>('show');
  const [positions, setPositions] = useState<number[]>([]);
  const [answers, setAnswers] = useState<string[]>(['', '', '']);
  const [confirmError, setConfirmError] = useState('');
  const [authFailed, setAuthFailed] = useState(false);

  // In first-run mode the screen must not be dismissed by a swipe: the backup is part of creating the wallet.
  const navigation = useNavigation();
  useEffect(() => {
    if (firstRun) navigation.setOptions({ gestureEnabled: false, headerBackVisible: false });
  }, [firstRun, navigation]);

  // Block screenshots while this screen is mounted (seed phrase is sensitive)
  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync();
    return () => { ScreenCapture.allowScreenCaptureAsync(); };
  }, []);

  useEffect(() => {
    reveal();
  }, []);

  async function reveal() {
    setLoading(true);
    const phrase = await loadMnemonic();
    setLoading(false);

    // Right after Create Wallet the phrase always exists, so null here means the biometric check was cancelled or
    // failed. Never skip the backup: ask again.
    if (phrase === null && firstRun) { setAuthFailed(true); return; }
    setAuthFailed(false);
    if (phrase !== null) {
      const n = phrase.trim().split(/\s+/).length;
      const set = new Set<number>();
      while (set.size < 3) set.add(Math.floor(Math.random() * n));
      setPositions([...set].sort((x, y) => x - y));
    }
    if (phrase === null) {
      Alert.alert(
        'No Seed Phrase',
        'This wallet was imported via a private key. There is no seed phrase — keep your private key safe instead.',
      );
    } else {
      setMnemonic(phrase);
    }
  }

  async function handleCopy() {
    if (!mnemonic) return;
    await copyWithAutoClear(mnemonic, 30_000);
    Alert.alert(
      'Copied',
      'Seed phrase copied. It will be cleared from your clipboard automatically in 30 seconds.',
    );
  }

  const words = mnemonic ? mnemonic.trim().split(/\s+/) : [];

  function checkAnswers() {
    const ok = positions.every((pos, i) => (answers[i] ?? '').trim().toLowerCase() === words[pos]);
    if (!ok) { setConfirmError('Those words do not match your recovery phrase. Check the phrase and try again.'); return; }
    router.replace('/pin-setup');
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>

        <View style={styles.warning}>
          <Ionicons name="warning-outline" size={20} color={COLORS.warning} />
          <Text style={styles.warningText}>
            Never share your seed phrase with anyone. Anyone with these words can steal all your funds. Screenshots are blocked on this screen.
          </Text>
        </View>

        {firstRun && authFailed ? (
          <View style={styles.noPhrase}>
            <Ionicons name="finger-print-outline" size={40} color={COLORS.textMuted} />
            <Text style={styles.noPhraseText}>Unlock to see your recovery phrase</Text>
            <Text style={styles.noPhraseHint}>
              Your wallet is created, but it isn’t backed up yet. Authenticate to see your phrase and write it down.
            </Text>
            <TouchableOpacity style={styles.copyBtn} onPress={reveal} activeOpacity={0.85}>
              <Text style={styles.copyBtnText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : firstRun && step === 'confirm' && mnemonic ? (
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>Check your backup</Text>
            <Text style={styles.tip}>Type these words from your recovery phrase to prove you saved it.</Text>
            {positions.map((pos, i) => (
              <View key={pos} style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>Word {pos + 1}</Text>
                <TextInput
                  style={styles.confirmInput}
                  value={answers[i]}
                  onChangeText={(t) => { setConfirmError(''); setAnswers((a) => a.map((v, k) => (k === i ? t : v))); }}
                  autoCapitalize="none" autoCorrect={false} placeholder="word" placeholderTextColor={COLORS.textDim}
                />
              </View>
            ))}
            {!!confirmError && <Text style={styles.confirmError}>{confirmError}</Text>}
            <TouchableOpacity style={styles.copyBtn} onPress={checkAnswers} activeOpacity={0.85}>
              <Text style={styles.copyBtnText}>Confirm and continue</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.hideBtn} onPress={() => { setStep('show'); setHidden(false); }} activeOpacity={0.7}>
              <Text style={styles.hideBtnText}>Back to my phrase</Text>
            </TouchableOpacity>
          </View>
        ) : loading ? (
          <Text style={styles.loadingText}>Authenticating…</Text>
        ) : mnemonic ? (
          <>
            <View style={styles.phraseBox}>
              {hidden ? (
                <TouchableOpacity style={styles.revealBtn} onPress={() => setHidden(false)} activeOpacity={0.8}>
                  <Ionicons name="eye-outline" size={24} color={COLORS.accent} />
                  <Text style={styles.revealText}>Tap to reveal seed phrase</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.grid}>
                  {words.map((word, i) => (
                    <View key={i} style={styles.wordCard}>
                      <Text style={styles.wordNum}>{i + 1}</Text>
                      <Text style={styles.wordText}>{word}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {!hidden && (
              <>
                <TouchableOpacity style={styles.copyBtn} onPress={handleCopy} activeOpacity={0.8}>
                  <Ionicons name="copy-outline" size={18} color={COLORS.bg} />
                  <Text style={styles.copyBtnText}>Copy all words (auto-clears in 30s)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.hideBtn} onPress={() => setHidden(true)} activeOpacity={0.7}>
                  <Text style={styles.hideBtnText}>Hide seed phrase</Text>
                </TouchableOpacity>
              </>
            )}

            <Text style={styles.tip}>
              Write these {words.length} words on paper in order and store them somewhere secure offline. Do not save them in a notes app, cloud storage, or take a screenshot.
            </Text>
            {firstRun && (
              <TouchableOpacity
                style={[styles.copyBtn, hidden && { opacity: 0.4 }]}
                disabled={hidden}
                onPress={() => { setHidden(true); setStep('confirm'); }}
                activeOpacity={0.85}
              >
                <Text style={styles.copyBtnText}>I have written it down</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <View style={styles.noPhrase}>
            <Ionicons name="key-outline" size={40} color={COLORS.textMuted} />
            <Text style={styles.noPhraseText}>No seed phrase available</Text>
            <Text style={styles.noPhraseHint}>
              This wallet was imported with a private key. Back up your private key instead from the settings.
            </Text>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content:   { padding: SPACING.lg, gap: SPACING.lg },

  warning: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: 'rgba(255,175,50,0.1)',
    borderRadius: RADIUS.md, borderWidth: 1,
    borderColor: 'rgba(255,175,50,0.25)', padding: SPACING.md,
  },
  warningText: { flex: 1, fontSize: 13, color: COLORS.warning, lineHeight: 20 },
  loadingText: { color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.xl },

  phraseBox: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  revealBtn: { padding: SPACING.xl, alignItems: 'center', gap: 10 },
  revealText: { color: COLORS.accent, fontSize: 15, fontWeight: '600' },

  grid: { padding: SPACING.md, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wordCard: {
    width: '30%',
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 10, paddingHorizontal: 8,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  wordNum:  { fontSize: 10, color: COLORS.textDim, width: 16, textAlign: 'right' },
  wordText: { fontSize: 13, color: COLORS.text, fontWeight: '600', flexShrink: 1 },

  copyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingVertical: 14,
  },
  copyBtnText: { color: COLORS.bg, fontWeight: '700', fontSize: 14 },
  hideBtn:     { alignItems: 'center', paddingVertical: 8 },
  hideBtnText: { color: COLORS.textMuted, fontSize: 14 },

  tip: {
    fontSize: 12, color: COLORS.textDim, lineHeight: 18,
    textAlign: 'center', paddingHorizontal: SPACING.sm,
  },
  confirmBox: { gap: SPACING.md },
  confirmTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  confirmRow: { gap: 6 },
  confirmLabel: { fontSize: 12, color: COLORS.textMuted },
  confirmInput: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: 14, color: COLORS.text, fontSize: 16,
  },
  confirmError: { color: COLORS.error, fontSize: 13, textAlign: 'center' },
  noPhrase: { alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xl },
  noPhraseText: { fontSize: 16, color: COLORS.textMuted, fontWeight: '600' },
  noPhraseHint: { fontSize: 13, color: COLORS.textDim, textAlign: 'center', lineHeight: 20 },
});
