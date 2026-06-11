import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '@/hooks/useWallet';
import { splitPrivateKey, shardToPayload, type GuardianShard } from '@/wallet/sss';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { copyWithAutoClear } from '@/utils/clipboard';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

const GUARDIAN_LABELS = ['Guardian 1', 'Guardian 2', 'Keep yourself'];

export default function GuardianSetupScreen() {
  const { address } = useWallet();
  const [shards,     setShards]  = useState<GuardianShard[] | null>(null);
  const [loading,   setLoading]  = useState(false);
  const [current,   setCurrent]  = useState(0);

  async function generate() {
    setLoading(true);
    try {
      const s = await splitPrivateKey(address!, 2, 3);
      setShards(s);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to split key');
    } finally {
      setLoading(false);
    }
  }

  async function copyShard(shard: GuardianShard) {
    await copyWithAutoClear(shardToPayload(shard), 60_000);
    Alert.alert(
      'Shard copied',
      'Shard copied — clears from clipboard in 60 seconds.\n\nShare it via a secure channel. Never post it online.',
    );
  }

  // ── Pre-generation info screen ──────────────────────────────────────────────
  if (!shards) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Social Recovery</Text>
          <Text style={styles.subtitle}>
            Your key is split into 3 shards using Shamir's Secret Sharing.
            Any 2 of 3 can reconstruct your wallet — one shard alone reveals nothing.
          </Text>

          <View style={styles.stepList}>
            {[
              'Generate 3 shards (biometric required)',
              'Share shard 1 with a trusted Guardian',
              'Share shard 2 with a second trusted Guardian',
              'Keep shard 3 in your own secure storage',
            ].map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>

          <Card tone="warning">
            <View style={styles.warnRow}>
              <Ionicons name="shield-outline" size={15} color={COLORS.warning} />
              <Text style={styles.warnText}>
                Never give two shards to the same person. Choose guardians you deeply trust.
              </Text>
            </View>
          </Card>

          <Button
            title={loading ? 'Generating…' : 'Generate Shards'}
            onPress={generate}
            loading={loading}
            leadingIcon={
              !loading
                ? <Ionicons name="people-outline" size={18} color={COLORS.bg} />
                : undefined
            }
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Per-shard display ───────────────────────────────────────────────────────
  const shard   = shards[current];
  const label   = GUARDIAN_LABELS[current] ?? `Shard ${current + 1}`;
  const isLast  = current === shards.length - 1;
  const payload = shardToPayload(shard);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* Progress dots */}
        <View style={styles.progress}>
          {shards.map((_, i) => (
            <View key={i} style={[styles.progDot, i === current && styles.progDotActive]} />
          ))}
        </View>

        <Text style={styles.title}>Shard {shard.index} of {shard.total}</Text>
        <Text style={styles.subtitle}>
          {current < 2 ? `Share with ${label}` : 'Store this safely yourself'}
        </Text>

        <Card style={styles.shardCard}>
          <Text style={styles.shardLabel}>{label}</Text>
          <Text style={styles.shardPayload} numberOfLines={5} ellipsizeMode="tail">
            {payload}
          </Text>
          <TouchableOpacity style={styles.copyRow} onPress={() => copyShard(shard)} activeOpacity={0.7}>
            <Ionicons name="copy-outline" size={15} color={COLORS.accent} />
            <Text style={styles.copyText}>Copy shard (auto-clears in 60s)</Text>
          </TouchableOpacity>
        </Card>

        <Card tone="warning">
          <Text style={styles.warnSmall}>
            {shard.threshold}-of-{shard.total} threshold · one shard alone is useless
          </Text>
        </Card>

        <View style={styles.navRow}>
          {current > 0 && (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => setCurrent(c => c - 1)}
              activeOpacity={0.7}
            >
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
          )}
          {isLast ? (
            <Button
              title="Done"
              style={styles.navBtn}
              onPress={() => {
                Alert.alert(
                  'Guardians set up',
                  'Any 2 of your 3 guardians can help recover your wallet.',
                  [{ text: 'OK', onPress: () => router.back() }],
                );
              }}
            />
          ) : (
            <Button
              title={`Next: ${GUARDIAN_LABELS[current + 1]} →`}
              style={styles.navBtn}
              onPress={() => setCurrent(c => c + 1)}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content:   { padding: SPACING.lg, paddingBottom: SPACING.xxl, gap: SPACING.lg },

  title:    { fontSize: 24, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.textMuted, lineHeight: 22, marginTop: -SPACING.sm },

  stepList: { gap: SPACING.md },
  stepRow:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  stepBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.accentSoft,
    borderWidth: 1, borderColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.accent },
  stepText:      { fontSize: 14, color: COLORS.text, flex: 1, lineHeight: 20 },

  warnRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  warnText:  { flex: 1, fontSize: 13, color: COLORS.warning, lineHeight: 20 },
  warnSmall: { fontSize: 12, color: COLORS.warning, lineHeight: 18 },

  progress:     { flexDirection: 'row', gap: 8, alignSelf: 'center' },
  progDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border },
  progDotActive:{ backgroundColor: COLORS.accent },

  shardCard:    { gap: SPACING.sm },
  shardLabel:   {
    fontSize: 11, fontWeight: '600', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  shardPayload: {
    fontSize: 11, color: COLORS.textDim,
    fontFamily: 'monospace', lineHeight: 18,
  },
  copyRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: SPACING.sm },
  copyText: { fontSize: 13, color: COLORS.accent },

  navRow:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  navBtn:  { flex: 1 },
  backBtn: {
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
    minHeight: 52,
  },
  backBtnText: { fontSize: 15, color: COLORS.textMuted, fontWeight: '500' },
});
