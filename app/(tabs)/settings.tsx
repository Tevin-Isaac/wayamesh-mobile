import { View, Text, StyleSheet, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { COLORS, SPACING } from '@/constants/theme';
import { CHAIN, ACTIVE_NETWORK } from '@/constants/chain';

function SettingRow({ label, value, onToggle }: { label: string; value: boolean; onToggle: (v: boolean) => void }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: COLORS.border, true: COLORS.accent }}
        thumbColor={COLORS.text}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const [biometric, setBiometric] = useState(true);
  const [autoSettle, setAutoSettle] = useState(true);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.heading}>Settings</Text>

        <Text style={styles.section}>Security</Text>
        <Card style={styles.card}>
          <SettingRow label="Biometric unlock" value={biometric} onToggle={setBiometric} />
        </Card>

        <Text style={styles.section}>Network</Text>
        <Card style={styles.card}>
          <SettingRow label="Auto-settle when online" value={autoSettle} onToggle={setAutoSettle} />
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Network</Text>
            <Text style={styles.infoValue}>{ACTIVE_NETWORK === 'testnet' ? 'Testnet' : 'Mainnet'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Chain ID</Text>
            <Text style={styles.infoValue}>{CHAIN.chainId}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>RPC</Text>
            <Text style={[styles.infoValue, styles.mono]} numberOfLines={1}>{CHAIN.rpc}</Text>
          </View>
        </Card>

        <Text style={styles.section}>About</Text>
        <Card style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Built with</Text>
            <Text style={styles.infoValue}>Expo + Arc</Text>
          </View>
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg },
  heading: { fontSize: 28, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.lg },
  section: { fontSize: 12, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: SPACING.sm, marginTop: SPACING.md },
  card: { gap: SPACING.sm },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingLabel: { fontSize: 15, color: COLORS.text },
  divider: { height: 1, backgroundColor: COLORS.border },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { fontSize: 14, color: COLORS.textMuted },
  infoValue: { fontSize: 14, color: COLORS.text },
  mono: { fontFamily: 'monospace', fontSize: 11, flexShrink: 1, marginLeft: SPACING.sm, textAlign: 'right' },
});
