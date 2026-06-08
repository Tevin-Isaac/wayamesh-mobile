import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initDatabase } from '@/db/schema';
import { COLORS } from '@/constants/theme';

export default function RootLayout() {
  useEffect(() => {
    initDatabase();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={COLORS.bg} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="send"
          options={{
            presentation: 'modal',
            headerShown: true,
            headerTitle: 'Send USDC',
            headerStyle: { backgroundColor: COLORS.surface },
            headerTintColor: COLORS.text,
          }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
