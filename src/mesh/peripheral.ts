import WayameshBle, { isPeripheralSupported } from '../../modules/wayamesh-ble';
import { requestBlePermissions } from './ble';
import { encodeEnvelope } from './envelope';
import { ingestEnvelope, type IngestResult } from './ingest';

// Receiving side of the BLE handoff: advertise as a Wayamesh peripheral,
// accept chunked payment frames from a nearby phone, validate + queue them.
// Pure transport — all trust decisions live in envelope.ts / ingest.ts.

export { isPeripheralSupported };

/**
 * Start listening for payments over Bluetooth. Resolves to a stop function.
 * Throws if permissions are denied or the radio can't advertise.
 */
export async function startReceiving(
  myAddress: string | null,
  onPayment: (result: IngestResult) => void,
  onError?: (message: string) => void,
): Promise<() => Promise<void>> {
  const native = WayameshBle;
  if (!native || !isPeripheralSupported()) {
    throw new Error('Bluetooth receiving is not supported on this device/build');
  }
  const granted = await requestBlePermissions();
  if (!granted) throw new Error('Bluetooth permission denied');

  const sub = native.addListener('onEnvelopeReceived', ({ rawSigned }) => {
    try {
      onPayment(ingestEnvelope(encodeEnvelope(rawSigned), myAddress, 'ble'));
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Received an invalid payment');
    }
  });

  try {
    await native.startAdvertising();
  } catch (e) {
    sub.remove();
    throw e;
  }

  return async () => {
    sub.remove();
    try { await native.stopAdvertising(); } catch { /* already stopped */ }
  };
}
