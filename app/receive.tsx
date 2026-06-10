import { View, Text, StyleSheet, TouchableOpacity, Alert, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { router } from 'expo-router';
import { useWallet } from '@/hooks/useWallet';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

export default function ReceiveScreen() {
  const { address } = useWallet();

  async function copyAddress() {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    Alert.alert('Copied', 'Address copied to clipboard');
  }

  async function shareAddress() {
    if (!address) return;
    await Share.share({ message: address });
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Receive USDC</Text>
        <Text style={styles.subtitle}>
          Share your address or QR code to receive USDC on Arc.
        </Text>

        <View style={styles.qrCard}>
          {address ? (
            <QRCode
              value={address}
              size={220}
              color={COLORS.text}
              backgroundColor={COLORS.surface}
            />
          ) : (
            <View style={styles.qrPlaceholder}>
              <Text style={styles.qrPlaceholderText}>Loading...</Text>
            </View>
          )}
        </View>

        <View style={styles.addressBox}>
          <Text style={styles.addressLabel}>Your Arc address</Text>
          <Text style={styles.address} selectable>{address ?? '—'}</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={copyAddress} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>Copy Address</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={shareAddress} activeOpacity={0.7}>
            <Text style={styles.secondaryBtnText}>Share</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.networkNote}>Arc Testnet · USDC native token</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: {
    flex: 1,
    alignItems: 'center',
    padding: SPACING.lg,
    paddingTop: SPACING.xl,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 20,
  },
  qrCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.lg,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  qrPlaceholder: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrPlaceholderText: { color: COLORS.textMuted },
  addressBox: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  addressLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  address: {
    fontSize: 12,
    color: COLORS.text,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  actions: {
    width: '100%',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: COLORS.accent,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryBtnText: {
    color: COLORS.bg,
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryBtn: {
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryBtnText: { color: COLORS.textMuted, fontSize: 15 },
  networkNote: {
    fontSize: 11,
    color: COLORS.textDim,
    textAlign: 'center',
  },
});
