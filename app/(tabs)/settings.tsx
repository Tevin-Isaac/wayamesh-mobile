import { View, Text, StyleSheet, Switch, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { router } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import { CHAIN, ACTIVE_NETWORK } from '@/constants/chain';
import { useWallet } from '@/hooks/useWallet';

function SettingRow({
  label,
  value,
  onToggle,
}: {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}) {
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
  const { logout, address } = useWallet();
  const [biometric, setBiometric] = useState(true);
  const [autoSettle, setAutoSettle] = useState(true);

  function confirmLogout() {
    Alert.alert(
      'Sign Out',
      'This will remove your wallet from this device. Make sure you have your seed phrase or private key saved before continuing.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/onboarding');
          },
        },
      ],
    );
  }

  const short = address ? `${address.slice(0, 10)}...${address.slice(-8)}` : '—';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Settings</Text>

        {/* Wallet info */}
        <Text style={styles.section}>Wallet</Text>
        <Card style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Address</Text>
            <Text style={[styles.infoValue, styles.mono]} numberOfLines={1}>{short}</Text>
          </View>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => router.push('/receive')}
            activeOpacity={0.7}
          >
            <Text style={styles.actionLabel}>Receive USDC</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </Card>

        {/* Security */}
        <Text style={styles.section}>Security</Text>
        <Card style={styles.card}>
          <SettingRow label="Biometric unlock" value={biometric} onToggle={setBiometric} />
        </Card>

        {/* Network */}
        <Text style={styles.section}>Network</Text>
        <Card style={styles.card}>
          <SettingRow label="Auto-settle when online" value={autoSettle} onToggle={setAutoSettle} />
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Network</Text>
            <Text style={styles.infoValue}>
              {ACTIVE_NETWORK === 'testnet' ? 'Testnet' : 'Mainnet'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Chain ID</Text>
            <Text style={styles.infoValue}>{CHAIN.chainId}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>RPC</Text>
            <Text style={[styles.infoValue, styles.mono]} numberOfLines={1}>
              {CHAIN.rpc}
            </Text>
          </View>
        </Card>

        {/* About */}
        <Text style={styles.section}>About</Text>
        <Card style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Built with</Text>
            <Text style={styles.infoValue}>Expo · Arc · ethers.js</Text>
          </View>
        </Card>

        {/* Danger zone */}
        <Text style={styles.section}>Account</Text>
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={confirmLogout}
          activeOpacity={0.8}
        >
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
        <Text style={styles.logoutHint}>
          Removes wallet from this device. You can restore it later with your seed phrase.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  section: {
    fontSize: 12,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  card: { gap: SPACING.sm },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingLabel: { fontSize: 15, color: COLORS.text },
  divider: { height: 1, backgroundColor: COLORS.border },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: { fontSize: 14, color: COLORS.textMuted },
  infoValue: { fontSize: 14, color: COLORS.text },
  mono: {
    fontFamily: 'monospace',
    fontSize: 11,
    flexShrink: 1,
    marginLeft: SPACING.sm,
    textAlign: 'right',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionLabel: { fontSize: 15, color: COLORS.accent },
  chevron: { fontSize: 20, color: COLORS.textMuted },
  logoutBtn: {
    backgroundColor: 'rgba(255,77,106,0.1)',
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,77,106,0.3)',
    marginTop: SPACING.sm,
  },
  logoutText: {
    color: COLORS.error,
    fontWeight: '700',
    fontSize: 16,
  },
  logoutHint: {
    fontSize: 12,
    color: COLORS.textDim,
    textAlign: 'center',
    marginTop: SPACING.sm,
    lineHeight: 18,
  },
});
