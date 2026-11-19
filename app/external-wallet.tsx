import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { COLORS, SPACING } from '@/constants/theme';

// OPTIONAL feature screen. The heavy WalletConnect/Reown SDK is loaded only here, on demand, and inside a
// try/catch: if it is missing (older app build) or fails to start, only this screen shows a message and the
// rest of the wallet is untouched.
export default function ExternalWalletScreen() {
  const [Comp, setComp] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('../src/external/ExternalWallet');
      setComp(() => mod.default);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the wallet connection.');
    }
  }, []);

  if (Comp) return <Comp />;
  return (
    <View style={styles.center}>
      {error ? (
        <>
          <Text style={styles.title}>Not available in this version</Text>
          <Text style={styles.sub}>Connecting another wallet needs the latest app update. Everything else in Wayamesh works as usual.</Text>
        </>
      ) : (
        <ActivityIndicator color={COLORS.accent} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: 10 },
  title: { color: COLORS.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  sub: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
