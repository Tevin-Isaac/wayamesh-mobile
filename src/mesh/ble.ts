import { BleManager, Device, BleError } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import { logMeshRelay } from '@/db/queries';

const SERVICE_UUID = 'c0de0001-cafe-beef-dead-0000wayamesh';
const TX_CHAR_UUID = 'c0de0002-cafe-beef-dead-0000wayamesh';
const CHUNK_SIZE = 512;

let manager: BleManager | null = null;

export function getBleManager(): BleManager {
  if (!manager) {
    manager = new BleManager();
  }
  return manager;
}

export async function requestBlePermissions(): Promise<boolean> {
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

export function scanForPeers(onPeer: (device: Device) => void): () => void {
  const ble = getBleManager();
  ble.startDeviceScan([SERVICE_UUID], null, (error: BleError | null, device: Device | null) => {
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
    // Peer moved out of range, silently skip
  }
}

export function destroyBleManager(): void {
  manager?.destroy();
  manager = null;
}
