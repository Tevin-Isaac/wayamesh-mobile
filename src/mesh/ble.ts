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
// Each write is a JSON frame (~100 B overhead incl. the 66-char id) + this many base64 chars.
// 96 keeps the largest write under ~190 bytes, which fits the MTU phones commonly negotiate.
const CHUNK_SIZE = 96;

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
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { BleManager } = require('react-native-ble-plx');
      _manager = new BleManager();
    } catch {
      // Expo Go / no native module / Bluetooth stack unavailable: behave as "no Bluetooth", never crash.
      _bleAvailable = false;
      return null;
    }
  }
  return _manager;
}

export async function requestBlePermissions(): Promise<boolean> {
  if (!isBleAvailable()) return false;
  if (Platform.OS === 'android') {
    // Android 12+ (API 31) has dedicated Bluetooth permissions. Android 10-11 does not
    // know them (asking would always report "denied") and needs location for scanning.
    const api = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
    const wanted = api >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
    const grants = await PermissionsAndroid.requestMultiple(wanted);
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
  try {
    // Errors (Bluetooth off, permission revoked) arrive in the callback and are ignored: the UI shows "no peers".
    ble.startDeviceScan([SERVICE_UUID], null, (error: unknown, device: DeviceType | null) => {
      if (error || !device) return;
      onPeer(device);
    });
  } catch {
    return () => {};
  }
  return () => { try { ble.stopDeviceScan(); } catch { /* ignore */ } };
}

/**
 * Relay a signed transaction to a nearby peer over BLE (central → peripheral).
 *
 * Each write is a self-describing JSON frame {h,i,n,d} so the receiver can
 * reassemble in order and confirm it has all n chunks before broadcasting.
 *
 * This is the SENDING (central) half; the receiving half is the native
 * peripheral in modules/wayamesh-ble (advertises the service + GATT server
 * that reassembles these frames). Frame sizes assume an MTU of 512, which we
 * request right after connecting.
 */
export async function relayTransaction(
  payload: string,   // full payment envelope (or bare signed tx from old callers)
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
    // Chunk frames are ~360 bytes after JSON + base64 overhead; the 23-byte
    // default MTU would reject them. 512 is universally negotiable on 5.0+.
    try { await device.requestMTU(512); } catch { /* stack may auto-negotiate */ }
    await device.discoverAllServicesAndCharacteristics();

    const data   = Buffer.from(payload, 'utf8').toString('base64');
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

    // Chat messages (mpm1:, EXPERIMENTAL) are not transactions: mesh_relays has a foreign key to transactions.
    if (!payload.startsWith('mpm1:')) logMeshRelay(txHash, peerId);
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
