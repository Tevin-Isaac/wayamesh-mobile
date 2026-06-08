import { Platform, PermissionsAndroid } from 'react-native';
import { logMeshRelay } from '@/db/queries';

// react-native-ble-plx is a native module — not available in Expo Go.
// We load it lazily so the app runs in Expo Go without crashing.
// In a real dev/production build the full native implementation is used.
type BleManagerType = import('react-native-ble-plx').BleManager;
type DeviceType = import('react-native-ble-plx').Device;

const SERVICE_UUID = 'c0de0001-cafe-beef-dead-0000wayamesh';
const TX_CHAR_UUID = 'c0de0002-cafe-beef-dead-0000wayamesh';
const CHUNK_SIZE = 512;

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

export async function relayTransaction(
  rawSigned: string,
  txHash: string,
  peerId: string,
): Promise<void> {
  const ble = getBleManager();
  if (!ble) {
    console.log('[BLE] Not available in Expo Go — relay skipped');
    return;
  }

  try {
    const device = await ble.connectToDevice(peerId);
    await device.discoverAllServicesAndCharacteristics();

    const payload = Buffer.from(rawSigned, 'utf8');
    for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
      const chunk = payload.slice(i, i + CHUNK_SIZE).toString('base64');
      await device.writeCharacteristicWithResponseForService(SERVICE_UUID, TX_CHAR_UUID, chunk);
    }

    logMeshRelay(txHash, peerId);
    await device.cancelConnection();
  } catch {
    // Peer moved out of range
  }
}

export function destroyBleManager(): void {
  _manager?.destroy();
  _manager = null;
}

export function bleIsAvailable(): boolean {
  return isBleAvailable();
}
