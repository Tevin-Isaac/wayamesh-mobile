import {
  View, Text, StyleSheet, Switch, Alert, ScrollView,
  TouchableOpacity, Modal, FlatList, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { getMyName } from '@/chat/identity';
import { copyWithAutoClear } from '@/utils/clipboard';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Eyebrow } from '@/components/pro';
import { COLORS, SPACING, RADIUS, FONTS } from '@/constants/theme';
import { ACTIVE_CHAIN } from '@/constants/chain';
import { useWallet } from '@/hooks/useWallet';
import { setKeyAuthBinding } from '@/wallet/keystore';
import { getPreferences, setBiometric, setAutoSettle, setLanguage } from '@/utils/preferences';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '@/i18n';
import i18n from '@/i18n';

type IconName = keyof typeof Ionicons.glyphMap;

function Row({
  icon, label, value, control, chevron, danger, onPress,
}: {
  icon: IconName; label: string; value?: string;
  control?: React.ReactNode; chevron?: boolean; danger?: boolean; onPress?: () => void;
}) {
  const Wrap: React.ElementType = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Ionicons name={icon} size={18} color={danger ? COLORS.error : COLORS.accent} />
      </View>
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {control}
      {chevron && <Ionicons name="chevron-forward" size={18} color={COLORS.textDim} />}
    </Wrap>
  );
}

const HR = () => <View style={styles.hr} />;

export default function SettingsScreen() {
  const { logout, address } = useWallet();

  const [biometric, setBiometricState] = useState(true);
  const [autoSettle, setAutoSettleState] = useState(true);
  const [langCode, setLangCode] = useState<LanguageCode>('en');
  const [langPicker, setLangPicker] = useState(false);
  const [myName, setMyNameState] = useState('');
  useFocusEffect(useCallback(() => { try { setMyNameState(getMyName()); } catch { setMyNameState(''); } }, []));
  async function copyMyAddress() {
    if (!address) return;
    await copyWithAutoClear(address, 30_000);
    Alert.alert('Copied', 'Address copied. It clears from your clipboard in 30 seconds.');
  }

  useEffect(() => {
    try {
      const prefs = getPreferences();
      setBiometricState(prefs.biometric_enabled);
      setAutoSettleState(prefs.auto_settle_enabled);
      setLangCode(prefs.language as LanguageCode);
    } catch { /* DB not ready */ }
  }, []);

  const short = address ? `${address.slice(0, 10)}…${address.slice(-8)}` : '—';

  async function handleBiometric(val: boolean) {
    const ok = await setKeyAuthBinding(val);
    if (!ok) {
      Alert.alert(
        val ? 'Could not enable' : 'Could not disable',
        val
          ? 'This device has no biometric or screen lock enrolled. Set one up in your device settings first.'
          : 'Authentication was cancelled. Biometric unlock stays on.',
      );
      return;
    }
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

  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === langCode) ?? SUPPORTED_LANGUAGES[0];

  function confirmLogout() {
    Alert.alert(
      'Sign Out',
      'This will remove your wallet from this device. Make sure you have your seed phrase or private key saved before continuing.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: async () => { await logout(); router.replace('/onboarding'); } },
      ],
    );
  }

  const toggle = (val: boolean, on: (v: boolean) => void) => (
    <Switch value={val} onValueChange={on} trackColor={{ false: COLORS.border, true: COLORS.accent }} thumbColor={COLORS.text} />
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Settings</Text>

        {/* wallet profile */}
        <View style={styles.profileCard}>
          <View style={styles.profileTop}>
            <View style={styles.avatarRing}>
              <Avatar seed={address ?? 'You'} size={64} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName} numberOfLines={1}>{myName || 'Your wallet'}</Text>
              <TouchableOpacity onPress={copyMyAddress} activeOpacity={0.7} style={styles.profileAddrRow}>
                <Text style={styles.profileAddr}>{short}</Text>
                <Ionicons name="copy-outline" size={13} color={COLORS.textMuted} />
              </TouchableOpacity>
              <View style={styles.profileChips}>
                <View style={styles.liveChip}><View style={styles.liveDot} /><Text style={styles.liveChipText}>{ACTIVE_CHAIN.name}</Text></View>
              </View>
            </View>
          </View>
          <View style={styles.profileActions}>
            <TouchableOpacity style={styles.profileBtn} onPress={() => router.push('/my-card')} activeOpacity={0.8}>
              <Ionicons name="id-card-outline" size={17} color={COLORS.accent} />
              <Text style={styles.profileBtnText}>{myName ? 'Edit name & card' : 'Set your name'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.profileBtn} onPress={copyMyAddress} activeOpacity={0.8}>
              <Ionicons name="copy-outline" size={17} color={COLORS.accent} />
              <Text style={styles.profileBtnText}>Copy address</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Eyebrow style={styles.eyebrow}>Security</Eyebrow>
        <View style={styles.group}>
          <Row icon="scan-outline" label="Biometric unlock" control={toggle(biometric, handleBiometric)} />
          <HR />
          <Row icon="key-outline" label="Recovery phrase" chevron onPress={() => router.push('/backup')} />
          <HR />
          <Row icon="people-outline" label="Guardian recovery" chevron onPress={() => router.push('/guardian-setup')} />
          <HR />
          <Row icon="speedometer-outline" label="Limits" value="Spending and accept" chevron onPress={() => router.push('/limits')} />
          <HR />
          <Row icon="shield-checkmark-outline" label="What is protected" chevron onPress={() => router.push('/security')} />
        </View>

        <Eyebrow style={styles.eyebrow}>Recovery</Eyebrow>
        <View style={styles.group}>
          <Row icon="cloud-upload-outline" label="Cloud backup" value="PIN protected" chevron onPress={() => router.push('/pin-setup')} />
        </View>

        <Eyebrow style={styles.eyebrow}>Optional</Eyebrow>
        <View style={styles.group}>
          <Row icon="link-outline" label="External wallet" value="Optional" chevron onPress={() => router.push('/external-wallet')} />
        </View>

        <Eyebrow style={styles.eyebrow}>Gasless USDC · Beta</Eyebrow>
        <View style={styles.group}>
          <Row icon="card-outline" label="Smart account" value="Gas in USDC" chevron onPress={() => router.push('/smart-account')} />
          <HR />
          <Row icon="sparkles-outline" label="Agent wallet" value="Mandate" chevron onPress={() => router.push('/agent')} />
        </View>

        <Eyebrow style={styles.eyebrow}>Preferences</Eyebrow>
        <View style={styles.group}>
          <Row icon="flash-outline" label="Auto-settle when online" control={toggle(autoSettle, handleAutoSettle)} />
          <HR />
          <Row icon="language-outline" label="Language" value={`${currentLang.flag}  ${currentLang.name}`} chevron onPress={() => setLangPicker(true)} />
        </View>

        <Eyebrow style={styles.eyebrow}>Network</Eyebrow>
        <View style={styles.group}>
          <Row icon="globe-outline" label="Network" value={ACTIVE_CHAIN.name} />
          <HR />
          <Row icon="git-network-outline" label="Chain ID" value={String(ACTIVE_CHAIN.chainId)} />
          <HR />
          {ACTIVE_CHAIN.testnet && (
            <Row icon="water-outline" label="Get test USDC" value="Free, from Circle" chevron onPress={() => Linking.openURL(ACTIVE_CHAIN.faucet ?? 'https://faucet.circle.com')} />
          )}
        </View>

        <Eyebrow style={styles.eyebrow}>Wallet</Eyebrow>
        <View style={styles.group}>
          <Row icon="qr-code-outline" label="Receive USDC" chevron onPress={() => router.push('/receive')} />
          <HR />
          <Row icon="card-outline" label="Add money · Cash out" chevron onPress={() => router.push('/ramp')} />
        </View>

        <TouchableOpacity style={styles.signOut} onPress={confirmLogout} activeOpacity={0.85}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
        <Text style={styles.about}>Wayamesh · v{Constants.expoConfig?.version ?? '?'} · Built on Arc{ACTIVE_CHAIN.testnet ? ' · Testnet' : ''}</Text>
      </ScrollView>

      {/* language picker */}
      <Modal visible={langPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setLangPicker(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Language</Text>
            <TouchableOpacity onPress={() => setLangPicker(false)} activeOpacity={0.7}>
              <Text style={styles.modalClose}>Done</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={SUPPORTED_LANGUAGES}
            keyExtractor={(item) => item.code}
            ItemSeparatorComponent={() => <View style={styles.hr} />}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.langOption} onPress={() => handleSelectLanguage(item.code as LanguageCode)} activeOpacity={0.7}>
                <Text style={styles.langOptionFlag}>{item.flag}</Text>
                <Text style={[styles.langOptionName, item.code === langCode && styles.langOptionActive]}>{item.name}</Text>
                {item.code === langCode && <Ionicons name="checkmark" size={18} color={COLORS.accent} />}
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg,
    padding: SPACING.md, gap: SPACING.md, marginBottom: SPACING.sm,
  },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarRing: { padding: 3, borderRadius: 999, borderWidth: 1.5, borderColor: COLORS.accent },
  profileName: { fontSize: 19, fontWeight: '700', color: COLORS.text, letterSpacing: -0.3 },
  profileAddrRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  profileAddr: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONTS.mono },
  profileChips: { flexDirection: 'row', marginTop: 8 },
  liveChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, backgroundColor: COLORS.accentSoft,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accent },
  liveChipText: { fontSize: 11.5, color: COLORS.accent, fontWeight: '600' },
  profileActions: { flexDirection: 'row', gap: 10 },
  profileBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 11, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg,
  },
  profileBtnText: { fontSize: 13.5, color: COLORS.text, fontWeight: '600' },

  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  heading: { fontSize: 28, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.lg, letterSpacing: -0.3 },

  accountHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: SPACING.sm, marginBottom: SPACING.sm },
  accountName: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  accountAddr: { fontSize: 12, color: COLORS.textDim, fontFamily: FONTS.mono, marginTop: 2 },

  eyebrow: { marginTop: SPACING.md, marginBottom: SPACING.sm },
  group: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md,
  },

  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  rowIcon: {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.border,
  },
  rowIconDanger: { backgroundColor: COLORS.errorSoft, borderColor: 'rgba(255,77,106,0.3)' },
  rowLabel: { flex: 1, fontSize: 15, color: COLORS.text, fontWeight: '500' },
  rowLabelDanger: { color: COLORS.error },
  rowValue: { fontSize: 13, color: COLORS.textMuted },
  hr: { height: 1, backgroundColor: COLORS.border },

  signOut: {
    marginTop: SPACING.xl, paddingVertical: 15, borderRadius: RADIUS.md, alignItems: 'center',
    backgroundColor: COLORS.errorSoft, borderWidth: 1, borderColor: 'rgba(255,77,106,0.3)',
  },
  signOutText: { color: COLORS.error, fontWeight: '700', fontSize: 15 },
  about: { fontSize: 12, color: COLORS.textDim, textAlign: 'center', marginTop: SPACING.md },

  modalContainer: { flex: 1, backgroundColor: COLORS.bg },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  modalClose: { fontSize: 16, color: COLORS.accent, fontWeight: '600' },
  langOption: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingHorizontal: SPACING.lg, paddingVertical: 16 },
  langOptionFlag: { fontSize: 26 },
  langOptionName: { flex: 1, fontSize: 16, color: COLORS.text },
  langOptionActive: { color: COLORS.accent, fontWeight: '600' },
});
