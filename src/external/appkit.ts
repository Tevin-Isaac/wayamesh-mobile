import '@walletconnect/react-native-compat'; // must come first: polyfills for the WalletConnect SDK
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAppKit, type AppKitNetwork, type Storage } from '@reown/appkit-react-native';
import { EthersAdapter } from '@reown/appkit-ethers-react-native';
import { arcTestnet } from 'viem/chains';

// OPTIONAL external-wallet connection (WalletConnect / Reown). Nothing in the core wallet imports this file:
// it is loaded only when the user opens Settings → External wallet, so the wallet works fully without it.
//
// The project id is public by design (it ships inside every app that uses WalletConnect).
export const WALLETCONNECT_PROJECT_ID = 'd67d9c8e54efc7222feed4178262bda0';

// AppKit keeps its pairing/session state in this key-value store (JSON values, namespaced so it never touches our data).
const PREFIX = '@wayamesh_appkit/';
const storage: Storage = {
  async getKeys() {
    return (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX)).map((k) => k.slice(PREFIX.length));
  },
  async getEntries<T = unknown>() {
    const keys = await storage.getKeys();
    const rows = await AsyncStorage.multiGet(keys.map((k) => PREFIX + k));
    return rows.map(([k, v]) => [k.slice(PREFIX.length), v === null ? undefined : (JSON.parse(v) as T)]) as [string, T][];
  },
  async getItem<T = unknown>(key: string) {
    const v = await AsyncStorage.getItem(PREFIX + key);
    if (v === null) return undefined;
    try { return JSON.parse(v) as T; } catch { return undefined; }
  },
  async setItem<T = unknown>(key: string, value: T) { await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value)); },
  async removeItem(key: string) { await AsyncStorage.removeItem(PREFIX + key); },
};

/** Arc Testnet in the shape AppKit expects. */
export const arcNetwork = { ...arcTestnet, chainNamespace: 'eip155', caipNetworkId: `eip155:${arcTestnet.id}` } as unknown as AppKitNetwork;

let instance: ReturnType<typeof createAppKit> | null = null;

export function getAppKit() {
  if (!instance) {
    instance = createAppKit({
      projectId: WALLETCONNECT_PROJECT_ID,
      networks: [arcNetwork],
      defaultNetwork: arcNetwork,
      storage,
      adapters: [new EthersAdapter()],
      metadata: {
        name: 'Wayamesh',
        description: 'Pay in USDC, even offline.',
        url: 'https://wayamesh.xyz',
        icons: ['https://wayamesh.xyz/icon.png'],
        redirect: { native: 'wayamesh://', universal: 'https://wayamesh.xyz' },
      },
    });
  }
  return instance;
}

export { arcTestnet };
