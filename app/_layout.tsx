import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Stack, useRootNavigationState, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initDatabase } from '@/db/schema';
import { hasWallet } from '@/wallet/keystore';
import { backupExists } from '@/wallet/backup';
import { settlePendingTransactions } from '@/wallet/transactions';
import { COLORS } from '@/constants/theme';

const MODAL_HEADER = {
  headerShown: true,
  headerStyle: { backgroundColor: COLORS.surface },
  headerTintColor: COLORS.text,
  headerShadowVisible: false,
};

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const [walletExists, setWalletExists] = useState<boolean | null>(null);
  const navigationState = useRootNavigationState();
  const appState = useRef(AppState.currentState);

  // Bootstrap: init DB then check wallet
  useEffect(() => {
    async function bootstrap() {
      await initDatabase();
      const exists = await hasWallet();
      setWalletExists(exists);
      // If no wallet but a backup exists on device, land on restore screen
      if (!exists) {
        const hasBkp = await backupExists();
        if (hasBkp) {
          setDbReady(true);
          return;
        }
      }
      setDbReady(true);
    }
    bootstrap();
  }, []);

  // Navigate only after the navigator is mounted AND DB check is done
  useEffect(() => {
    if (!navigationState?.key || !dbReady || walletExists === null) return;
    if (walletExists) {
      router.replace('/(tabs)');
    } else {
      // backupExists check happens async; we re-evaluate after dbReady
      backupExists().then(hasBkp => {
        router.replace(hasBkp ? '/restore' : '/onboarding');
      });
    }
  }, [navigationState?.key, dbReady, walletExists]);

  // Auto-settle pending transactions when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (appState.current !== 'active' && nextState === 'active') {
        settlePendingTransactions().catch(() => {});
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={COLORS.bg} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="onboarding" options={{ animation: 'none' }} />
        <Stack.Screen name="(tabs)"     options={{ animation: 'none' }} />
        <Stack.Screen
          name="send"
          options={{ presentation: 'modal', headerTitle: 'Send USDC', ...MODAL_HEADER }}
        />
        <Stack.Screen
          name="receive"
          options={{ presentation: 'modal', headerTitle: 'Receive USDC', ...MODAL_HEADER }}
        />
        <Stack.Screen
          name="import"
          options={{ presentation: 'modal', headerTitle: 'Import Wallet', ...MODAL_HEADER }}
        />
        <Stack.Screen
          name="scan"
          options={{ presentation: 'fullScreenModal', headerShown: false }}
        />
        <Stack.Screen
          name="backup"
          options={{ presentation: 'modal', headerTitle: 'Seed Phrase Backup', ...MODAL_HEADER }}
        />
        <Stack.Screen
          name="confirm"
          options={{ presentation: 'modal', headerTitle: 'Review Transaction', ...MODAL_HEADER }}
        />
        <Stack.Screen
          name="pin-setup"
          options={{ headerShown: false, animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="restore"
          options={{ headerShown: false, animation: 'none' }}
        />
        <Stack.Screen
          name="guardian-setup"
          options={{ presentation: 'modal', headerTitle: 'Guardian Recovery', ...MODAL_HEADER }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
