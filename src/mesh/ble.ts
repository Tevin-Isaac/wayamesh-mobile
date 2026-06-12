import { Platform, PermissionsAndroid } from 'react-native';
import { logMeshRelay } from '@/db/queries';

// react-native-ble-plx is a native module — not available in Expo Go.
// We load it lazily so the app runs in Expo Go without crashing.
// In a real dev/production build the full native implementation is used.
type BleManagerType = import('react-native-ble-plx').BleManager;
type DeviceType = import('react-native-ble-plx').Device;

// Valid 128-bit UUIDs (8-4-4-4-12 hex). The previous values contained the
// non-hex string "wayamesh" and would throw the moment startDeviceScan ran on a
// real build. These are stable, app-specific identifiers.
const SERVICE_UUID = 'c0de0001-cafe-beef-dead-000000000001';
const TX_CHAR_UUID = 'c0de0002-cafe-beef-dead-000000000002';

// BLE characteristic writes are small; we frame the signed tx as length-prefixed
// chunks so the receiving peer can reassemble and verify completeness.
const CHUNK_SIZE = 180; // safe below the 185-byte default ATT MTU payload

let _manager: BleManagerType | null = null;
let _bleAvailable: boolean | null = null;

function isBleAvailable(): boolean {
  if (_bleAvailable !== null) return _bleAvailable;
  try {
    require('react-native-ble-plx');
    _bleAvailable = true;
  } catch {
    _bleAvailable = false;
  }
  return _bleAvailable;
}

function getBleManager(): BleManagerType | null {
  if (!isBleAvailable()) return null;
  if (!_manager) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BleManager } = require('react-native-ble-plx');
    _manager = new BleManager();
  }
  return _manager;
}

export async function requestBlePermissions(): Promise<boolean> {
  if (!isBleAvailable()) return false;
  if (Platform.OS === 'android') {
    const grants = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    return Object.values(grants).every((g) => g === PermissionsAndroid.RESULTS.GRANTED);
  }
  return true;
}

export function scanForPeers(onPeer: (device: DeviceType) => void): () => void {
  const ble = getBleManager();
  if (!ble) {
    console.log('[BLE] Not available in Expo Go — scan skipped');
    return () => {};
  }
  ble.startDeviceScan([SERVICE_UUID], null, (error: unknown, device: DeviceType | null) => {
    if (error || !device) return;
    onPeer(device);
  });
  return () => ble.stopDeviceScan();
}

/**
 * Relay a signed transaction to a nearby peer over BLE (central → peripheral).
 *
 * Each write is a self-describing JSON frame {h,i,n,d} so the receiver can
 * reassemble in order and confirm it has all n chunks before broadcasting.
 *
 * NOTE: this is the SENDING (central) half. A peer can only *receive* a relay if
 * it runs a GATT server / advertises as a peripheral — which react-native-ble-plx
 * does not support. Bidirectional mesh requires a peripheral transport (a native
 * BLE-peripheral module on Android, or Nearby Connections / MultipeerConnectivity).
 * Until that lands, relayTransaction is a no-op against non-existent peers; the
 * working settlement path is the sender's own device reconnecting (see
 * settlePendingTransactions).
 */
export async function relayTransaction(
  rawSigned: string,
  txHash: string,
  peerId: string,
): Promise<boolean> {
  const ble = getBleManager();
  if (!ble) {
    console.log('[BLE] Not available in Expo Go — relay skipped');
    return false;
  }

  try {
    const device = await ble.connectToDevice(peerId);
    await device.discoverAllServicesAndCharacteristics();

    const data   = Buffer.from(rawSigned, 'utf8').toString('base64');
    const chunks = Math.ceil(data.length / CHUNK_SIZE);
    for (let i = 0; i < chunks; i++) {
      const frame = JSON.stringify({
        h: txHash,
        i,
        n: chunks,
        d: data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
      });
      const encoded = Buffer.from(frame, 'utf8').toString('base64');
      await device.writeCharacteristicWithResponseForService(SERVICE_UUID, TX_CHAR_UUID, encoded);
    }

    logMeshRelay(txHash, peerId);
    await device.cancelConnection();
    return true;
  } catch {
    return false; // peer out of range / no GATT server
  }
}

export function destroyBleManager(): void {
  _manager?.destroy();
  _manager = null;
}

export function bleIsAvailable(): boolean {
  return isBleAvailable();
}
