import { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Device } from 'react-native-ble-plx';
import { requestBlePermissions, scanForPeers } from '@/mesh/ble';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { COLORS, SPACING } from '@/constants/theme';

export default function MeshScreen() {
  const [scanning, setScanning] = useState(false);
  const [peers, setPeers] = useState<Device[]>([]);
  const [stopScan, setStopScan] = useState<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      stopScan?.();
    };
  }, [stopScan]);

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
        return [...prev, device];
      });
    });

    setStopScan(() => stop);
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={peers}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <Text style={styles.heading}>Mesh Network</Text>
            <Card style={styles.statusCard} accent={scanning}>
              <Text style={styles.statusLabel}>{scanning ? 'Scanning for peers...' : 'Mesh offline'}</Text>
              <Text style={styles.peerCount}>{peers.length} peer{peers.length !== 1 ? 's' : ''} found</Text>
            </Card>
            <Button
              title={scanning ? 'Stop Scan' : 'Scan for Peers'}
              variant={scanning ? 'secondary' : 'primary'}
              onPress={toggleScan}
              style={styles.scanBtn}
            />
            {peers.length > 0 && <Text style={styles.peersHeader}>Nearby Peers</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.peerCard}>
            <Text style={styles.peerId}>{item.name ?? 'Unknown device'}</Text>
            <Text style={styles.peerMeta}>{item.id}</Text>
            {item.rssi && <Text style={styles.peerRssi}>Signal: {item.rssi} dBm</Text>}
          </Card>
        )}
        ListEmptyComponent={
          scanning ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No peers yet</Text>
              <Text style={styles.emptyHint}>Nearby Wayamesh users will appear here</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  list: { padding: SPACING.lg, gap: SPACING.sm },
  heading: { fontSize: 28, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.md },
  statusCard: { marginBottom: SPACING.md },
  statusLabel: { fontSize: 14, color: COLORS.textMuted, marginBottom: 4 },
  peerCount: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  scanBtn: { marginBottom: SPACING.lg },
  peersHeader: { fontSize: 13, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: SPACING.sm },
  peerCard: { gap: 2 },
  peerId: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  peerMeta: { fontSize: 11, color: COLORS.textDim, fontFamily: 'monospace' },
  peerRssi: { fontSize: 12, color: COLORS.accent },
  empty: { alignItems: 'center', paddingTop: SPACING.xxl },
  emptyText: { fontSize: 16, color: COLORS.textMuted, fontWeight: '600' },
  emptyHint: { fontSize: 13, color: COLORS.textDim, marginTop: SPACING.xs },
});
