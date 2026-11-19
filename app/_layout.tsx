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
import { settlePendingTransactions, settlePendingVouchers, countPendingVouchers } from '@/wallet/transactions';
import { fetchReserve } from '@/wallet/meshpay';
import { loadWallet } from '@/wallet/keystore';
import { syncIncoming } from '@/wallet/sync';
import { getWallet } from '@/db/queries';
import { getPreferences } from '@/utils/preferences';
import { startChat, stopChat, flushOutbox, purgeNow } from '@/chat/service';
import { lockChat, purgeLegacyChatKey, isChatUnlocked } from '@/chat/identity';
import { ErrorBoundary } from '@/components/ErrorBoundary';
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
      void purgeLegacyChatKey(); // the previous design's unprotected chat key must not linger
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
      // Detect USDC received by this wallet (log-scan + balance-delta).
      try {
        const addr = getWallet()?.address;
        if (addr) await syncIncoming(addr);
        // Keep the offline-reserve cache fresh so the sender knows what it can spend.
        if (addr) await fetchReserve(addr);
      } catch {
        // offline — next tick retries
      }
      // MeshPayV2 vouchers must be settled by a transaction from THIS phone's
      // key. With biometric binding on, that needs a prompt, so it happens from
      // the "Settle now" action; with it off we can settle silently.
      try {
        if (countPendingVouchers() > 0 && !getPreferences().biometric_enabled) {
          const w = await loadWallet();
          if (w) await settlePendingVouchers(w);
        }
      } catch {
        // offline — next tick retries
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

  // Chat: subscribe to relays while the app is active (foreground only; nothing runs in the background).
  useEffect(() => {
    if (!dbReady) return;
    purgeNow(); // chat messages self-delete after 24h
    void startChat(); // no-ops until chat is unlocked (one biometric when the user opens Chats, sends or pays)
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') { purgeNow(); if (isChatUnlocked()) void startChat(); }
      else if (next === 'background') { stopChat(); lockChat(); } // leaving the foreground stops relays and wipes the in-memory chat key; not on 'inactive' (the iOS Face ID prompt causes it)
    });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void flushOutbox(); }, 30_000);
    const purgeTimer = setInterval(() => { if (AppState.currentState === 'active') purgeNow(); }, 5 * 60_000);
    return () => { sub.remove(); clearInterval(timer); clearInterval(purgeTimer); stopChat(); };
  }, [dbReady]);

  // Hold render until brand fonts are ready to avoid a font-swap flash — but
  // fail open: if font loading errors, render anyway with system fonts rather
  // than hanging on a blank screen.
  if (!fontsLoaded && !fontError) return null;

  return (
    <I18nextProvider i18n={i18n}>
    <SafeAreaProvider>
      <ErrorBoundary>
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
        <Stack.Screen
          name="add-contact"
          options={{ presentation: 'modal', headerTitle: 'Add contact', ...MODAL_HEADER }}
        />
        <Stack.Screen
          name="my-card"
          options={{ presentation: 'modal', headerTitle: 'My card', ...MODAL_HEADER }}
        />
        <Stack.Screen
          name="agent-chat"
          options={{ presentation: 'modal', headerTitle: 'Ask your wallet', ...MODAL_HEADER }}
        />
        <Stack.Screen
          name="payment-qr"
          options={{ presentation: 'modal', headerTitle: 'Offline handoff', ...MODAL_HEADER }}
        />
        <Stack.Screen
          name="receive-payment"
          options={{ presentation: 'modal', headerTitle: 'Incoming payment', ...MODAL_HEADER }}
        />
        <Stack.Screen
          name="reserve"
          options={{ presentation: 'modal', headerTitle: 'Offline reserve', ...MODAL_HEADER }}
        />
        <Stack.Screen
          name="limits"
          options={{ presentation: 'modal', headerTitle: 'Limits', ...MODAL_HEADER }}
        />
        <Stack.Screen
          name="security"
          options={{ presentation: 'modal', headerTitle: 'What is protected', ...MODAL_HEADER }}
        />
        <Stack.Screen
          name="requests"
          options={{ presentation: 'modal', headerTitle: 'Message requests', ...MODAL_HEADER }}
        />
        <Stack.Screen
          name="ramp"
          options={{ presentation: 'modal', headerTitle: 'Add money', ...MODAL_HEADER }}
        />
        <Stack.Screen
          name="external-wallet"
          options={{ presentation: 'modal', headerTitle: 'External wallet (optional)', ...MODAL_HEADER }}
        />
      </Stack>
      </ErrorBoundary>
    </SafeAreaProvider>
    </I18nextProvider>
  );
}
