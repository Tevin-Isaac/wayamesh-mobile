import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Vibration, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { ethers } from 'ethers';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { isEnvelope } from '@/mesh/envelope';
import { COLORS } from '@/constants/theme';

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const didRequest = useRef(false);

  useEffect(() => {
    if (!permission?.granted && !didRequest.current) {
      didRequest.current = true;
      requestPermission();
    }
  }, [permission]);

  // Paste path: a payment code received as text (WhatsApp, SMS, email…).
  async function pasteCode() {
    const text = (await Clipboard.getStringAsync()).trim();
    if (!text) { Alert.alert('Nothing to paste', 'Copy a payment code (starts with mp2:) first.'); return; }
    if (!isEnvelope(text) && !ethers.isAddress(text)) {
      Alert.alert('Not a payment code', 'The copied text is not a Wayamesh payment code or address.');
      return;
    }
    handleBarcode({ data: text });
  }

  function handleBarcode({ data }: { data: string }) {
    if (scanned) return;

    // Offline payment handoff — the QR *is* a signed transaction
    if (isEnvelope(data)) {
      setScanned(true);
      Vibration.vibrate(60);
      router.replace({ pathname: '/receive-payment', params: { payload: data.trim() } });
      return;
    }

    // Accept bare addresses or ethereum: URIs (e.g. ethereum:0x…)
    const raw = data.startsWith('ethereum:') ? data.slice(9).split('?')[0] : data.trim();

    if (!ethers.isAddress(raw)) return;

    setScanned(true);
    Vibration.vibrate(60);

    // Navigate to send with the scanned address pre-filled
    router.replace({ pathname: '/send', params: { scannedAddress: raw } });
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.msg}>Requesting camera access…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Ionicons name="camera-outline" size={48} color={COLORS.textMuted} />
        <Text style={styles.msg}>Camera access is required to scan QR codes.</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleBarcode}
      />

      {/* Dimmed overlay with finder hole */}
      <View style={styles.overlay}>
        <View style={styles.overlayTop} />
        <View style={styles.overlayRow}>
          <View style={styles.overlaySide} />
          <View style={styles.finder}>
            {/* Corner brackets */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <View style={styles.overlaySide} />
        </View>
        <View style={styles.overlayBottom}>
          <Text style={styles.hint}>Scan a wallet address or an offline payment code</Text>
          <TouchableOpacity style={styles.pasteBtn} onPress={pasteCode} activeOpacity={0.8}>
            <Ionicons name="clipboard-outline" size={16} color={COLORS.text} />
            <Text style={styles.pasteText}>Paste code from clipboard</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Close button */}
      <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
        <Ionicons name="close" size={28} color={COLORS.text} />
      </TouchableOpacity>
    </View>
  );
}

const FINDER = 240;
const CORNER = 24;
const BORDER = 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
    gap: 16,
    padding: 32,
  },
  msg: { color: COLORS.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  btn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: 8,
  },
  btnText: { color: COLORS.bg, fontWeight: '700', fontSize: 15 },

  overlay: { ...StyleSheet.absoluteFillObject },
  overlayTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayRow: { flexDirection: 'row', height: FINDER },
  overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 24,
  },
  hint: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  pasteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14,
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  pasteText: { color: COLORS.text, fontSize: 13.5, fontWeight: '600' },

  finder: {
    width: FINDER,
    height: FINDER,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: COLORS.accent,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: BORDER, borderLeftWidth: BORDER },
  cornerTR: { top: 0, right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: BORDER, borderLeftWidth: BORDER },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER },

  closeBtn: {
    position: 'absolute',
    top: 56,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
