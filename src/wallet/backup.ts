import * as FileSystem from 'expo-file-system/legacy';
import { encryptWithPin, decryptWithPin } from './pin';
import { importWallet } from './keystore';

const BACKUP_FILENAME = 'wayamesh_backup.json';
const BACKUP_PATH = `${FileSystem.documentDirectory}${BACKUP_FILENAME}`;

interface BackupEnvelope {
  version: number;
  address: string;
  createdAt: number;
  keystore: string;
}

export async function backupExists(): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(BACKUP_PATH);
  return info.exists;
}

/**
 * Encrypt the current wallet with PIN and write to documentDirectory.
 * On iOS this folder is iCloud-backed; on Android it persists in app storage.
 */
export async function saveBackup(address: string, pin: string): Promise<void> {
  const keystoreJson = await encryptWithPin(pin);
  const envelope: BackupEnvelope = {
    version: 1,
    address,
    createdAt: Math.floor(Date.now() / 1000),
    keystore: keystoreJson,
  };
  await FileSystem.writeAsStringAsync(
    BACKUP_PATH,
    JSON.stringify(envelope),
    { encoding: FileSystem.EncodingType.UTF8 },
  );
}

export async function readBackup(): Promise<BackupEnvelope | null> {
  if (!(await backupExists())) return null;
  const raw = await FileSystem.readAsStringAsync(BACKUP_PATH, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return JSON.parse(raw) as BackupEnvelope;
}

export async function deleteBackup(): Promise<void> {
  if (await backupExists()) {
    await FileSystem.deleteAsync(BACKUP_PATH, { idempotent: true });
  }
}

/**
 * Full restore: PIN-decrypt the saved keystore, import the private key into SecureStore.
 * Throws on wrong PIN (with lockout message from pin.ts).
 */
export async function restoreFromBackup(
  pin: string,
): Promise<{ address: string; publicKey: string }> {
  const envelope = await readBackup();
  if (!envelope) throw new Error('No backup found on this device');
  const wallet = await decryptWithPin(envelope.keystore, pin);
  return importWallet(wallet.privateKey);
}
