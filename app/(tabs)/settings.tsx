import {
  View, Text, StyleSheet, Switch, Alert, ScrollView,
  TouchableOpacity, Modal, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { StatRow } from '@/components/ui/StatRow';
import { Button } from '@/components/ui/Button';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import { CHAINS, ACTIVE_CHAIN } from '@/constants/chain';
import { useWallet } from '@/hooks/useWallet';
import {
  getPreferences, setBiometric, setAutoSettle, setLanguage,
} from '@/utils/preferences';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '@/i18n';
import i18n from '@/i18n';

const Divider = () => <View style={styles.divider} />;

function Eyebrow({ children }: { children: string }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export default function SettingsScreen() {
  const { logout, address } = useWallet();

  const [biometric,   setBiometricState]  = useState(true);
  const [autoSettle,  setAutoSettleState] = useState(true);
  const [langCode,    setLangCode]        = useState<LanguageCode>('en');
  const [langPicker,  setLangPicker]      = useState(false);

  // Load persisted preferences on mount
  useEffect(() => {
    try {
      const prefs = getPreferences();
      setBiometricState(prefs.biometric_enabled);
      setAutoSettleState(prefs.auto_settle_enabled);
      setLangCode(prefs.language as LanguageCode);
    } catch {
      // DB not ready yet — defaults are fine
    }
  }, []);

  const short = address ? `${address.slice(0, 10)}…${address.slice(-8)}` : '—';

  function handleBiometric(val: boolean) {
    setBiometricState(val);
    setBiometric(val);
  }

  function handleAutoSettle(val: boolean) {
    setAutoSettleState(val);
    setAutoSettle(val);
  }

  async function handleSelectLanguage(code: LanguageCode) {
    setLangCode(code);
    setLanguage(code);
    await i18n.changeLanguage(code);
    setLangPicker(false);
  }

  const currentLang = SUPPORTED_LANGUAGES.find(l => l.code === langCode)
    ?? SUPPORTED_LANGUAGES[0];

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
                onValueChange={handleBiometric}
                trackColor={{ false: COLORS.border, true: COLORS.accent }}
                thumbColor={COLORS.text}
              />
            }
          />
        </Card>

        {/* Language */}
        <Eyebrow>Language</Eyebrow>
        <Card style={styles.card}>
          <TouchableOpacity
            style={styles.langRow}
            onPress={() => setLangPicker(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.langFlag}>{currentLang.flag}</Text>
            <Text style={styles.langName}>{currentLang.name}</Text>
            <Text style={styles.langChevron}>›</Text>
          </TouchableOpacity>
        </Card>

        {/* Network */}
        <Eyebrow>Network</Eyebrow>
        <Card style={styles.card}>
          <StatRow
            label="Auto-settle when online"
            control={
              <Switch
                value={autoSettle}
                onValueChange={handleAutoSettle}
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

      {/* Language picker modal */}
      <Modal
        visible={langPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setLangPicker(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Language</Text>
            <TouchableOpacity onPress={() => setLangPicker(false)} activeOpacity={0.7}>
              <Text style={styles.modalClose}>Done</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={SUPPORTED_LANGUAGES}
            keyExtractor={item => item.code}
            ItemSeparatorComponent={() => <View style={styles.divider} />}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.langOption}
                onPress={() => handleSelectLanguage(item.code as LanguageCode)}
                activeOpacity={0.7}
              >
                <Text style={styles.langOptionFlag}>{item.flag}</Text>
                <Text style={[
                  styles.langOptionName,
                  item.code === langCode && styles.langOptionActive,
                ]}>
                  {item.name}
                </Text>
                {item.code === langCode && (
                  <Text style={styles.langOptionCheck}>✓</Text>
                )}
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
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

  langRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: SPACING.sm, gap: SPACING.sm,
  },
  langFlag:    { fontSize: 22 },
  langName:    { flex: 1, fontSize: 15, fontWeight: '500', color: COLORS.text },
  langChevron: { fontSize: 20, color: COLORS.textMuted },

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

  // Language modal
  modalContainer: { flex: 1, backgroundColor: COLORS.bg },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  modalClose: { fontSize: 16, color: COLORS.accent, fontWeight: '600' },

  langOption: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingHorizontal: SPACING.lg, paddingVertical: 16,
  },
  langOptionFlag: { fontSize: 26 },
  langOptionName: { flex: 1, fontSize: 16, color: COLORS.text },
  langOptionActive: { color: COLORS.accent, fontWeight: '600' },
  langOptionCheck: { fontSize: 18, color: COLORS.accent, fontWeight: '700' },
});
