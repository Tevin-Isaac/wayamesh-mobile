import { requireOptionalNativeModule, type NativeModule } from 'expo-modules-core';

// JS face of the Wayamesh BLE peripheral (Android). Loads optionally so the
// app still runs in Expo Go, on iOS, and in dev clients built before this
// module existed — callers must check isPeripheralSupported() first.

export interface EnvelopeReceivedEvent {
  rawSigned: string;
  txHash: string;
  peer: string;
}

export interface AdvertisingChangedEvent {
  advertising: boolean;
  error?: number;
}

type WayameshBleEvents = {
  onEnvelopeReceived: (event: EnvelopeReceivedEvent) => void;
  onAdvertisingChanged: (event: AdvertisingChangedEvent) => void;
};

declare class WayameshBleModuleType extends NativeModule<WayameshBleEvents> {
  isSupported(): boolean;
  startAdvertising(): Promise<boolean>;
  stopAdvertising(): Promise<boolean>;
}

const WayameshBle = requireOptionalNativeModule<WayameshBleModuleType>('WayameshBle');

export function isPeripheralSupported(): boolean {
  try {
    return !!WayameshBle && WayameshBle.isSupported();
  } catch {
    return false;
  }
}

export default WayameshBle;
