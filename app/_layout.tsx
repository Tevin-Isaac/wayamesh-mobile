import { useEffect, useState } from 'react';
import { Stack, useRootNavigationState, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initDatabase } from '@/db/schema';
import { hasWallet } from '@/wallet/keystore';
import { COLORS } from '@/constants/theme';

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const [walletExists, setWalletExists] = useState<boolean | null>(null);
  const navigationState = useRootNavigationState();

  useEffect(() => {
    async function bootstrap() {
      await initDatabase();
      const exists = await hasWallet();
      setWalletExists(exists);
      setDbReady(true);
    }
    bootstrap();
  }, []);

  // Navigate only after both the navigator is mounted AND the DB check is done
  useEffect(() => {
    if (!navigationState?.key || !dbReady || walletExists === null) return;
    if (walletExists) {
      router.replace('/(tabs)');
    } else {
      router.replace('/onboarding');
    }
  }, [navigationState?.key, dbReady, walletExists]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={COLORS.bg} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="onboarding" options={{ animation: 'none' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
        <Stack.Screen
          name="send"
          options={{
            presentation: 'modal',
            headerShown: true,
            headerTitle: 'Send USDC',
            headerStyle: { backgroundColor: COLORS.surface },
            headerTintColor: COLORS.text,
            headerShadowVisible: false,
          }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
