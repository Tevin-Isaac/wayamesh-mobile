import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useWallet } from '@/hooks/useWallet';
import { useTransactions } from '@/hooks/useTransactions';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { COLORS, SPACING } from '@/constants/theme';

export default function WalletScreen() {
  const { address, balance, isLoading, hasWallet: walletExists, create, refresh } = useWallet();
  const { pendingCount } = useTransactions();

  if (!walletExists && !isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.onboarding}>
          <Text style={styles.logo}>WAYAMESH</Text>
          <Text style={styles.tagline}>Offline USDC payments{'\n'}via Bluetooth mesh</Text>
          <Button title="Create Wallet" onPress={create} loading={isLoading} style={styles.ctaBtn} />
        </View>
      </SafeAreaView>
    );
  }

  const short = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '—';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={COLORS.accent} />}
      >
        <Text style={styles.heading}>Wallet</Text>

        <Card accent style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>USDC Balance</Text>
          <Text style={styles.balance}>{balance ?? '—'}</Text>
          <Text style={styles.address}>{short}</Text>
        </Card>

        {pendingCount > 0 && (
          <Card style={styles.pendingCard}>
            <Text style={styles.pendingText}>
              {pendingCount} transaction{pendingCount > 1 ? 's' : ''} pending settlement
            </Text>
            <Text style={styles.pendingHint}>Will settle automatically when online</Text>
          </Card>
        )}

        <View style={styles.actions}>
          <Button
            title="Send USDC"
            onPress={() => router.push('/send')}
            style={styles.actionBtn}
          />
          <Button
            title="Copy Address"
            variant="secondary"
            onPress={() => {}}
            style={styles.actionBtn}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: SPACING.lg, flexGrow: 1 },
  onboarding: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  logo: { fontSize: 32, fontWeight: '800', color: COLORS.accent, letterSpacing: 4, marginBottom: SPACING.sm },
  tagline: { fontSize: 18, color: COLORS.textMuted, textAlign: 'center', lineHeight: 28, marginBottom: SPACING.xxl },
  ctaBtn: { width: '100%' },
  heading: { fontSize: 28, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.lg },
  balanceCard: { marginBottom: SPACING.lg },
  balanceLabel: { fontSize: 13, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: SPACING.xs },
  balance: { fontSize: 40, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.xs },
  address: { fontSize: 13, color: COLORS.textMuted, fontFamily: 'monospace' },
  pendingCard: { marginBottom: SPACING.lg, borderColor: COLORS.warning },
  pendingText: { fontSize: 14, color: COLORS.warning, fontWeight: '600', marginBottom: 2 },
  pendingHint: { fontSize: 12, color: COLORS.textMuted },
  actions: { gap: SPACING.sm },
  actionBtn: {},
});
