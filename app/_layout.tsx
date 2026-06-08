import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { initDatabase } from '@/db/schema';
import { hasWallet } from '@/wallet/keystore';
import { COLORS } from '@/constants/theme';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      await initDatabase();
      const walletExists = await hasWallet();
      if (!walletExists) {
        router.replace('/onboarding');
      } else {
        router.replace('/(tabs)');
      }
      setReady(true);
    }
    bootstrap();
  }, []);

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
