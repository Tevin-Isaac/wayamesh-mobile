import { View, Text, StyleSheet, Switch, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { router } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { StatRow } from '@/components/ui/StatRow';
import { Button } from '@/components/ui/Button';
import { COLORS, SPACING } from '@/constants/theme';
import { CHAINS, ACTIVE_CHAIN } from '@/constants/chain';
import { useWallet } from '@/hooks/useWallet';

const Divider = () => <View style={styles.divider} />;

function Eyebrow({ children }: { children: string }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export default function SettingsScreen() {
  const { logout, address } = useWallet();
  const [biometric, setBiometric] = useState(true);
  const [autoSettle, setAutoSettle] = useState(true);

  const short = address ? `${address.slice(0, 10)}…${address.slice(-8)}` : '—';

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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Settings</Text>

        {/* Wallet */}
        <Eyebrow>Wallet</Eyebrow>
        <Card style={styles.card}>
          <StatRow label="Address" value={short} mono />
          <Divider />
          <StatRow
            label="Receive USDC"
            accent chevron
            onPress={() => router.push('/receive')}
          />
          <Divider />
          <StatRow
            label="Backup Seed Phrase"
            accent chevron
            onPress={() => router.push('/backup')}
          />
        </Card>

        {/* Recovery */}
        <Eyebrow>Recovery</Eyebrow>
        <Card style={styles.card}>
          <StatRow
            label="Cloud Backup"
            value="Encrypted · PIN protected"
            accent chevron
            onPress={() => router.push('/pin-setup')}
          />
          <Divider />
          <StatRow
            label="Guardian Recovery"
            value="2-of-3 Shamir shards"
            accent chevron
            onPress={() => router.push('/guardian-setup')}
          />
        </Card>

        {/* Security */}
        <Eyebrow>Security</Eyebrow>
        <Card style={styles.card}>
          <StatRow
            label="Biometric unlock"
            control={
              <Switch
                value={biometric}
                onValueChange={setBiometric}
                trackColor={{ false: COLORS.border, true: COLORS.accent }}
                thumbColor={COLORS.text}
              />
            }
          />
        </Card>

        {/* Network */}
        <Eyebrow>Network</Eyebrow>
        <Card style={styles.card}>
          <StatRow
            label="Auto-settle when online"
            control={
              <Switch
                value={autoSettle}
                onValueChange={setAutoSettle}
                trackColor={{ false: COLORS.border, true: COLORS.accent }}
                thumbColor={COLORS.text}
              />
            }
          />
          <Divider />
          <StatRow label="Chain ID" value={String(ACTIVE_CHAIN.chainId)} mono />
          <StatRow label="RPC"      value={ACTIVE_CHAIN.rpc.replace('https://', '')} mono />
        </Card>

        {/* USDC Networks */}
        <Eyebrow>USDC Networks</Eyebrow>
        <Card style={styles.card}>
          {Object.values(CHAINS).map((chain, i, arr) => (
            <View key={chain.id}>
              <View style={styles.chainRow}>
                <View style={styles.chainInfo}>
                  <Text style={[styles.chainName, !chain.enabled && styles.chainNameDim]}>
                    {chain.name}
                  </Text>
                  <Text style={styles.chainMeta}>
                    {chain.usdc.type === 'native' ? 'Native USDC' : `ERC-20 · ${chain.usdc.decimals}dp`}
                    {chain.testnet ? ' · Testnet' : ''}
                  </Text>
                </View>
                <View style={[styles.chainBadge, chain.enabled ? styles.chainBadgeActive : styles.chainBadgeSoon]}>
                  <Text style={[styles.chainBadgeText, chain.enabled ? styles.chainBadgeTextActive : styles.chainBadgeTextSoon]}>
                    {chain.enabled ? 'Active' : 'Soon'}
                  </Text>
                </View>
              </View>
              {i < arr.length - 1 && <Divider />}
            </View>
          ))}
        </Card>

        {/* About */}
        <Eyebrow>About</Eyebrow>
        <Card style={styles.card}>
          <StatRow label="Version"    value="1.0.0" />
          <StatRow label="Built with" value="Expo · Arc · ethers.js" />
        </Card>

        {/* Sign out */}
        <Eyebrow>Account</Eyebrow>
        <Button
          title="Sign Out"
          variant="danger"
          onPress={confirmLogout}
        />
        <Text style={styles.signOutHint}>
          Removes wallet from this device. Restore it later with your seed phrase.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content:   { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  heading:   { fontSize: 28, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.lg, letterSpacing: -0.3 },
  eyebrow: {
    fontSize: 11, fontWeight: '600', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 1,
    marginBottom: SPACING.sm, marginTop: SPACING.md,
  },
  card:    { gap: SPACING.sm, marginBottom: SPACING.xs },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },
  signOutHint: {
    fontSize: 12, color: COLORS.textDim,
    textAlign: 'center', marginTop: SPACING.sm, lineHeight: 18,
  },

  chainRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 },
  chainInfo: { flex: 1, gap: 2 },
  chainName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  chainNameDim: { color: COLORS.textMuted },
  chainMeta: { fontSize: 11, color: COLORS.textDim },

  chainBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1,
  },
  chainBadgeActive: { backgroundColor: COLORS.accentSoft, borderColor: COLORS.accent },
  chainBadgeSoon:   { backgroundColor: 'transparent', borderColor: COLORS.border },
  chainBadgeText:     { fontSize: 11, fontWeight: '600' },
  chainBadgeTextActive: { color: COLORS.accent },
  chainBadgeTextSoon:   { color: COLORS.textDim },
});
