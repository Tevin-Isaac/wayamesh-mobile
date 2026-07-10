import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Switch, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { requestBlePermissions, scanForPeers, bleIsAvailable, relayTransaction } from '@/mesh/ble';
import { startReceiving, isPeripheralSupported } from '@/mesh/peripheral';
import { getPendingTransactions, type TransactionRow } from '@/db/queries';
import { useWallet } from '@/hooks/useWallet';
import { Eyebrow } from '@/components/pro';
import { COLORS, SPACING, RADIUS, FONTS } from '@/constants/theme';

interface PeerDevice {
  id: string;
  name: string | null;
  rssi: number | null;
}

export default function MeshScreen() {
  const { address } = useWallet();

  const [scanning, setScanning] = useState(false);
  const [peers, setPeers] = useState<PeerDevice[]>([]);
  const [stopScan, setStopScan] = useState<(() => void) | null>(null);

  const [receiving, setReceiving] = useState(false);
  const stopReceivingRef = useRef<(() => Promise<void>) | null>(null);

  const [pending, setPending] = useState<TransactionRow[]>([]);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [beamingTo, setBeamingTo] = useState<string | null>(null);

  const bleAvailable = bleIsAvailable();
  const canReceive = isPeripheralSupported();

  const refreshPending = useCallback(() => {
    try {
      const mine = getPendingTransactions().filter(
        (t) => !!address && t.from_address.toLowerCase() === address.toLowerCase(),
      );
      setPending(mine);
      setSelectedHash((cur) => (mine.some((t) => t.hash === cur) ? cur : mine[0]?.hash ?? null));
    } catch { /* db not ready */ }
  }, [address]);

  useEffect(() => {
    refreshPending();
    const t = setInterval(refreshPending, 5000);
    return () => clearInterval(t);
  }, [refreshPending]);

  useEffect(() => {
    return () => {
      stopScan?.();
      stopReceivingRef.current?.();
    };
  }, [stopScan]);

  async function toggleReceive(val: boolean) {
    if (!val) {
      await stopReceivingRef.current?.();
      stopReceivingRef.current = null;
      setReceiving(false);
      return;
    }
    try {
      const stop = await startReceiving(
        address,
        (res) => {
          refreshPending();
          const amt = Number(res.envelope.amount).toFixed(2);
          Alert.alert(
            res.status === 'duplicate' ? 'Already received' : res.role === 'recipient' ? 'Payment received' : 'Payment picked up',
            res.role === 'recipient'
              ? `$${amt} USDC over Bluetooth — settles on Arc when you're online.`
              : `Now carrying $${amt} USDC for ${res.envelope.to.slice(0, 8)}… — it settles when you're online.`,
          );
        },
        (msg) => Alert.alert('Rejected payment', msg),
      );
      stopReceivingRef.current = stop;
      setReceiving(true);
    } catch (e) {
      Alert.alert('Cannot receive', e instanceof Error ? e.message : 'Bluetooth error');
    }
  }

  async function toggleScan() {
    if (scanning) {
      stopScan?.();
      setScanning(false);
      setStopScan(null);
      return;
    }
    const granted = await requestBlePermissions();
    if (!granted) return;
    setPeers([]);
    setScanning(true);
    const stop = scanForPeers((device) => {
      setPeers((prev) => {
        if (prev.find((d) => d.id === device.id)) return prev;
        return [...prev, { id: device.id, name: device.name ?? null, rssi: device.rssi ?? null }];
      });
    });
    setStopScan(() => stop);
  }

  async function beam(peer: PeerDevice) {
    const tx = pending.find((t) => t.hash === selectedHash);
    if (!tx) {
      Alert.alert('Nothing to send', 'Sign a payment first (Send tab) — queued payments appear here.');
      return;
    }
    setBeamingTo(peer.id);
    try {
      const ok = await relayTransaction(tx.raw_signed, tx.hash, peer.id);
      Alert.alert(
        ok ? 'Handed off' : 'Handoff failed',
        ok
          ? `$${Number(tx.amount).toFixed(2)} USDC is now on their phone — it settles when either of you is online.`
          : 'Could not reach that device. Make sure they toggled "Receive via Bluetooth" and are nearby.',
      );
    } finally {
      setBeamingTo(null);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={scanning || peers.length > 0 ? peers : []}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <Text style={styles.heading}>Mesh</Text>

            {!bleAvailable && (
              <View style={[styles.card, styles.warnCard]}>
                <Text style={styles.warnTitle}>Bluetooth unavailable</Text>
                <Text style={styles.warnText}>
                  The mesh needs a development or production build — it can't run in Expo Go.
                </Text>
              </View>
            )}

            {/* receive toggle */}
            <View style={[styles.card, styles.rowCard]}>
              <View style={[styles.iconTile, receiving && styles.iconTileOn]}>
                <Ionicons name="bluetooth" size={20} color={receiving ? COLORS.bg : COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Receive via Bluetooth</Text>
                <Text style={styles.rowSub}>
                  {receiving
                    ? 'Discoverable — nearby phones can hand you payments'
                    : canReceive
                      ? 'Turn on to accept offline payments from nearby phones'
                      : 'Not supported in this build — update the app'}
                </Text>
              </View>
              <Switch
                value={receiving}
                onValueChange={toggleReceive}
                disabled={!canReceive}
                trackColor={{ false: COLORS.border, true: COLORS.accent }}
                thumbColor={COLORS.text}
              />
            </View>

            {/* queued payments to beam */}
            <Eyebrow style={styles.eyebrow}>Queued payments</Eyebrow>
            {pending.length === 0 ? (
              <Text style={styles.dim}>
                Nothing queued. Sign a payment offline and beam it to the receiver here.
              </Text>
            ) : (
              pending.map((t) => (
                <TouchableOpacity
                  key={t.hash}
                  style={[styles.card, styles.txRow, selectedHash === t.hash && styles.txRowOn]}
                  onPress={() => setSelectedHash(t.hash)}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name={selectedHash === t.hash ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={selectedHash === t.hash ? COLORS.accent : COLORS.textDim}
                  />
                  <Text style={styles.txAmt}>${Number(t.amount).toFixed(2)}</Text>
                  <Text style={styles.txTo} numberOfLines={1}>
                    to {t.to_address.slice(0, 8)}…{t.to_address.slice(-6)}
                  </Text>
                </TouchableOpacity>
              ))
            )}

            {/* scan */}
            <TouchableOpacity
              style={[styles.scanCta, scanning && styles.scanCtaOn]}
              onPress={toggleScan}
              disabled={!bleAvailable}
              activeOpacity={0.85}
            >
              {scanning
                ? <ActivityIndicator size="small" color={COLORS.accent} />
                : <Ionicons name="search" size={17} color={COLORS.bg} />}
              <Text style={[styles.scanCtaText, scanning && styles.scanCtaTextOn]}>
                {scanning ? 'Scanning — tap to stop' : 'Find nearby phones'}
              </Text>
            </TouchableOpacity>

            {(peers.length > 0 || scanning) && (
              <Eyebrow style={styles.eyebrow}>
                {`Nearby · ${peers.length} found${pending.length ? ' — tap one to hand off' : ''}`}
              </Eyebrow>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, styles.rowCard]}
            onPress={() => beam(item)}
            disabled={!!beamingTo || pending.length === 0}
            activeOpacity={0.75}
          >
            <View style={styles.iconTile}>
              {beamingTo === item.id
                ? <ActivityIndicator size="small" color={COLORS.accent} />
                : <Ionicons name="phone-portrait-outline" size={18} color={COLORS.accent} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.name ?? 'Wayamesh device'}</Text>
              <Text style={styles.rowSubMono}>{item.id}</Text>
            </View>
            {item.rssi !== null && <Text style={styles.rssi}>{item.rssi} dBm</Text>}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          scanning ? (
            <Text style={styles.dim}>Listening… ask the other phone to enable “Receive via Bluetooth”.</Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  list: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  heading: { fontSize: 28, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.lg, letterSpacing: -0.3 },

  card: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm,
  },
  warnCard: { backgroundColor: COLORS.warningSoft, borderColor: 'rgba(245,166,35,0.3)' },
  warnTitle: { fontSize: 14, color: COLORS.warning, fontWeight: '700', marginBottom: 4 },
  warnText: { fontSize: 13, color: COLORS.textMuted, lineHeight: 19 },

  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconTile: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  iconTileOn: { backgroundColor: COLORS.accent },
  rowTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, lineHeight: 17 },
  rowSubMono: { fontSize: 11, color: COLORS.textDim, fontFamily: FONTS.mono, marginTop: 2 },
  rssi: { fontSize: 11, color: COLORS.accent, fontFamily: FONTS.mono },

  eyebrow: { marginTop: SPACING.md, marginBottom: SPACING.sm },
  dim: { fontSize: 13, color: COLORS.textDim, lineHeight: 20, marginBottom: SPACING.sm },

  txRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  txRowOn: { borderColor: 'rgba(62,217,184,0.45)', backgroundColor: COLORS.accentSoft },
  txAmt: { fontFamily: FONTS.mono, fontSize: 15, fontWeight: '700', color: COLORS.text },
  txTo: { flex: 1, fontSize: 12, color: COLORS.textMuted, fontFamily: FONTS.mono },

  scanCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingVertical: 15,
    marginTop: SPACING.md, marginBottom: SPACING.xs,
    shadowColor: COLORS.accent, shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 6,
  },
  scanCtaOn: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: 'rgba(62,217,184,0.45)', shadowOpacity: 0 },
  scanCtaText: { color: COLORS.bg, fontWeight: '700', fontSize: 15 },
  scanCtaTextOn: { color: COLORS.accent },
});
