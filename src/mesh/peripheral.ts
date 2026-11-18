import WayameshBle, { isPeripheralSupported } from '../../modules/wayamesh-ble';
import { requestBlePermissions } from './ble';
import { encodeEnvelope, isEnvelope } from './envelope';
import { ingestEnvelope, type IngestResult } from './ingest';
import { isMessageCode } from '../chat/crypto';
import { ingestMessageCode } from '../chat/service';

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
    // Chat messages (EXPERIMENTAL, untested on devices): a sealed 'mpm1:' code goes to chat ingest, never to payments.
    if (isMessageCode(rawSigned)) {
      void ingestMessageCode(rawSigned);
      return;
    }
    try {
      // Peers send a full envelope (may carry courier metadata); older builds
      // send the bare signed tx — wrap those for compatibility.
      const payload = isEnvelope(rawSigned) ? rawSigned : encodeEnvelope(rawSigned);
      onPayment(ingestEnvelope(payload, myAddress, 'ble'));
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
