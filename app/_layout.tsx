import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Stack, useRootNavigationState, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nextProvider } from 'react-i18next';
import { useFonts } from 'expo-font';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { initDatabase } from '@/db/schema';
import { hasWallet } from '@/wallet/keystore';
import { backupExists } from '@/wallet/backup';
import { settlePendingTransactions } from '@/wallet/transactions';
import { getPreferences } from '@/utils/preferences';
import i18n from '@/i18n';
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

  const [fontsLoaded, fontError] = useFonts({
    InstrumentSerif_400Regular_Italic,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

  // Bootstrap: init DB then check wallet
  useEffect(() => {
    async function bootstrap() {
      await initDatabase();
      // Load persisted language preference
      try {
        const prefs = getPreferences();
        if (prefs.language && prefs.language !== i18n.language) {
          await i18n.changeLanguage(prefs.language);
        }
      } catch {
        // Ignore — DB may not have preferences row yet
      }
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

  // Auto-settle pending transactions (if enabled): on foreground AND on a periodic
  // retry while the app is active, so a queued offline tx settles as soon as
  // connectivity returns — not only when the user re-opens the app.
  useEffect(() => {
    function autoSettleEnabled(): boolean {
      try {
        return getPreferences().auto_settle_enabled;
      } catch {
        return true; // DB not ready — default to settling
      }
    }

    async function trySettle() {
      if (!autoSettleEnabled()) return;
      try {
        await settlePendingTransactions();
      } catch {
        // offline / RPC down — the next tick retries
      }
    }

    const sub = AppState.addEventListener('change', nextState => {
      if (appState.current !== 'active' && nextState === 'active') trySettle();
      appState.current = nextState;
    });

    // Retry every 30s while foregrounded; settlePendingTransactions is a no-op
    // when nothing is pending, so this is cheap.
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') trySettle();
    }, 30_000);

    trySettle(); // attempt once on mount

    return () => { sub.remove(); clearInterval(timer); };
  }, []);

  // Hold render until brand fonts are ready to avoid a font-swap flash — but
  // fail open: if font loading errors, render anyway with system fonts rather
  // than hanging on a blank screen.
  if (!fontsLoaded && !fontError) return null;

  return (
    <I18nextProvider i18n={i18n}>
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={COLORS.bg} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="onboarding" options={{ animation: 'none' }} />
        <Stack.Screen name="(tabs)"     options={{ animation: 'none' }} />
        <Stack.Screen
          name="send"
          options={{ presentation: 'modal', headerShown: false }}
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
        <Stack.Screen
          name="recover"
          options={{ presentation: 'modal', headerTitle: 'Recover with Guardians', ...MODAL_HEADER }}
        />
        <Stack.Screen
          name="smart-account"
          options={{ presentation: 'modal', headerTitle: 'Smart Account (Beta)', ...MODAL_HEADER }}
        />
        <Stack.Screen
          name="agent"
          options={{ presentation: 'modal', headerTitle: 'Agent Wallet (Beta)', ...MODAL_HEADER }}
        />
        <Stack.Screen
          name="chat-thread"
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
      </Stack>
    </SafeAreaProvider>
    </I18nextProvider>
  );
}
