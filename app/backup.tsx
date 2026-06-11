import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert,
} from 'react-native';
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

  const words = mnemonic ? mnemonic.split(' ') : [];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>

        <View style={styles.warning}>
          <Ionicons name="warning-outline" size={20} color={COLORS.warning} />
          <Text style={styles.warningText}>
            Never share your seed phrase with anyone. Anyone with these words can steal all your funds. Screenshots are blocked on this screen.
          </Text>
        </View>

        {loading ? (
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
  noPhrase: { alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xl },
  noPhraseText: { fontSize: 16, color: COLORS.textMuted, fontWeight: '600' },
  noPhraseHint: { fontSize: 13, color: COLORS.textDim, textAlign: 'center', lineHeight: 20 },
});
