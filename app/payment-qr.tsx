import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Share, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { StatusDot } from '@/components/pro';
import { getTransactionByHash } from '@/db/queries';
import { useWallet } from '@/hooks/useWallet';
import { encodeEnvelope } from '@/mesh/envelope';
import { getContact } from '@/db/chat';
import { COLORS, SPACING, RADIUS, FONTS } from '@/constants/theme';
import type { TransactionRow } from '@/db/queries';

// The sender's half of an offline handoff: show the signed transaction as a QR
// so the receiver's phone can hold it and settle it on THEIR connection.

export default function PaymentQrScreen() {
  const { hash } = useLocalSearchParams<{ hash: string }>();
  const { address } = useWallet();
  const [tx, setTx] = useState<TransactionRow | null>(null);

  // Poll so the status pill flips to Settled live if either side reconnects.
  useEffect(() => {
    const load = () => { try { setTx(hash ? getTransactionByHash(hash) : null); } catch { /* db */ } };
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [hash]);

  if (!tx) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.center}><Text style={styles.err}>Payment not found.</Text></View>
      </SafeAreaView>
    );
  }

  const who = getContact(tx.to_address.toLowerCase())?.name
    ?? `${tx.to_address.slice(0, 8)}…${tx.to_address.slice(-6)}`;
  const settled = tx.status === 'settled';
  // If we're carrying someone else's payment, stamp ourselves as courier so
  // the recipient's agent can tip us on delivery.
  const isCourier = !!address
    && tx.from_address.toLowerCase() !== address.toLowerCase()
    && tx.to_address.toLowerCase() !== address.toLowerCase();
  const payload = encodeEnvelope(tx.raw_signed, isCourier ? address ?? undefined : undefined);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.amount}>${Number(tx.amount).toFixed(2)}</Text>
        <Text style={styles.to}>to {who}</Text>
        <View style={{ marginTop: 6 }}><StatusDot status={tx.status} /></View>

        <View style={styles.qrCard}>
          {settled ? (
            <View style={styles.settledBox}>
              <Ionicons name="checkmark-circle" size={56} color={COLORS.accent} />
              <Text style={styles.settledText}>Settled on Arc</Text>
            </View>
          ) : (
            <QRCode
              value={payload}
              size={252}
              backgroundColor="#FFFFFF"
              color="#07070F"
              ecl="L"
            />
          )}
        </View>

        {!settled && (
          <>
            <View style={styles.shareRow}>
              <TouchableOpacity
                style={styles.shareBtn} activeOpacity={0.8}
                onPress={() => Share.share({ message: payload }).catch(() => undefined)}
              >
                <Ionicons name="share-outline" size={16} color={COLORS.accent} />
                <Text style={styles.shareText}>Send as text</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.shareBtn} activeOpacity={0.8}
                onPress={async () => { await Clipboard.setStringAsync(payload); Alert.alert('Copied', 'Copied. The receiver can paste it into Wayamesh instead of scanning.'); }}
              >
                <Ionicons name="copy-outline" size={16} color={COLORS.accent} />
                <Text style={styles.shareText}>Copy as text</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.stepRow}>
              <View style={styles.stepIcon}><Ionicons name="scan-outline" size={16} color={COLORS.accent} /></View>
              <Text style={styles.stepText}>
                The receiver opens Wayamesh → Scan and points their camera at this QR.
              </Text>
            </View>
            <View style={styles.stepRow}>
              <View style={styles.stepIcon}><Ionicons name="shield-checkmark-outline" size={16} color={COLORS.accent} /></View>
              <Text style={styles.stepText}>
                They now hold the signed payment. It settles the instant either
                phone finds internet — they no longer depend on you reconnecting.
              </Text>
            </View>
            <View style={styles.stepRow}>
              <View style={styles.stepIcon}><Ionicons name="lock-closed-outline" size={16} color={COLORS.accent} /></View>
              <Text style={styles.stepText}>
                The QR contains your signed payment. Nobody can change the
                amount or recipient.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, alignItems: 'center', paddingBottom: SPACING.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  err: { color: COLORS.textMuted, fontSize: 14 },

  amount: { fontFamily: FONTS.mono, fontSize: 44, fontWeight: '700', color: COLORS.text, letterSpacing: -1.5, marginTop: SPACING.sm },
  to: { fontSize: 14, color: COLORS.textMuted, marginTop: 4, fontFamily: FONTS.mono },

  qrCard: {
    backgroundColor: '#FFFFFF', borderRadius: RADIUS.xl, padding: 18,
    marginVertical: SPACING.lg,
    shadowColor: COLORS.accent, shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  settledBox: { width: 252, height: 252, alignItems: 'center', justifyContent: 'center', gap: 10 },
  settledText: { fontSize: 16, fontWeight: '700', color: '#07070F' },

  shareRow: { flexDirection: 'row', gap: 10, width: '100%', marginBottom: SPACING.lg },
  shareBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(62,217,184,0.4)', backgroundColor: COLORS.accentSoft,
  },
  shareText: { color: COLORS.accent, fontWeight: '700', fontSize: 14 },
  stepRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', width: '100%', marginBottom: SPACING.md },
  stepIcon: {
    width: 30, height: 30, borderRadius: 10, backgroundColor: COLORS.accentSoft,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  stepText: { flex: 1, fontSize: 13, color: COLORS.textMuted, lineHeight: 19 },
});
