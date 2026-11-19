import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BrowserProvider, parseUnits, isAddress } from 'ethers';
import { AppKitProvider, AppKit, useAppKit, useAccount, useProvider } from '@reown/appkit-react-native';
import { useWallet } from '@/hooks/useWallet';
import { safeDecimal } from '@/utils/safety';
import { ACTIVE_CHAIN } from '@/constants/chain';
import { COLORS, SPACING, RADIUS, FONTS } from '@/constants/theme';
import { getAppKit, arcTestnet, arcNetwork } from './appkit';

// OPTIONAL: connect another wallet app (MetaMask, Trust Wallet, Rainbow…) and top up this wallet from it.
// Wayamesh works fully without this. Every action is approved inside the other wallet app.

function Body() {
  const { address: myAddress } = useWallet();
  const { open, disconnect, switchNetwork } = useAppKit();
  const { address, isConnected, chainId } = useAccount();
  const { provider, providerType } = useProvider();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');

  const num = Number(amount || '0');
  const canSend = isConnected && !!myAddress && isAddress(myAddress) && !!safeDecimal(amount) && num > 0 && !busy;

  async function sendToMyWallet() {
    if (!canSend || !provider || providerType !== 'eip155' || !myAddress) return;
    setBusy(true); setError(''); setTxHash('');
    try {
      if (Number(String(chainId).replace('eip155:', '')) !== arcTestnet.id) {
        await switchNetwork(arcNetwork);
      }
      // Arc's USDC is the native token (18 decimals): a plain transfer to this wallet's address.
      const signer = await new BrowserProvider(provider as never).getSigner();
      const tx = await signer.sendTransaction({ to: myAddress, value: parseUnits(amount, 18) });
      setTxHash(tx.hash);
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 160) : 'The other wallet did not approve the transaction.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={18} color={COLORS.accent} />
          <Text style={styles.noteText}>
            Wayamesh works fully on its own. Connect another wallet app only if you want to top up from it. External wallets bring
            their own risks, and you approve every action inside that wallet.
          </Text>
        </View>

        {!isConnected ? (
          <TouchableOpacity style={styles.primary} onPress={() => open({ view: 'Connect' })} activeOpacity={0.85}>
            <Ionicons name="link-outline" size={18} color={COLORS.bg} />
            <Text style={styles.primaryText}>Connect a wallet</Text>
          </TouchableOpacity>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.label}>CONNECTED WALLET</Text>
              <Text style={styles.addr}>{address ? `${address.slice(0, 10)}…${address.slice(-8)}` : '—'}</Text>
              <TouchableOpacity onPress={() => disconnect()} activeOpacity={0.8} style={styles.linkBtn}>
                <Text style={styles.linkText}>Disconnect</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>TOP UP THIS WAYAMESH WALLET FROM IT</Text>
              <View style={styles.inputRow}>
                <Text style={styles.dollar}>$</Text>
                <TextInput
                  style={styles.input} value={amount} placeholder="0.00" placeholderTextColor={COLORS.textDim}
                  keyboardType="decimal-pad" onChangeText={(t) => { setError(''); setAmount(t.replace(/[^0-9.]/g, '').slice(0, 12)); }}
                />
                <Text style={styles.unit}>USDC</Text>
              </View>
              <Text style={styles.hint}>
                Sends USDC from the connected wallet to your Wayamesh address on {ACTIVE_CHAIN.name}. Network fees are paid by the connected wallet.
              </Text>
              <TouchableOpacity style={[styles.primary, !canSend && styles.off]} disabled={!canSend} onPress={sendToMyWallet} activeOpacity={0.85}>
                {busy ? <ActivityIndicator color={COLORS.bg} /> : <Ionicons name="arrow-down-circle-outline" size={18} color={COLORS.bg} />}
                <Text style={styles.primaryText}>{busy ? 'Waiting for your wallet…' : 'Send to my Wayamesh wallet'}</Text>
              </TouchableOpacity>
              {!!error && <Text style={styles.error}>{error}</Text>}
              {!!txHash && (
                <TouchableOpacity onPress={() => Linking.openURL(`${ACTIVE_CHAIN.explorer}/tx/${txHash}`)}>
                  <Text style={styles.link}>Sent. View the transaction →</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function ExternalWallet() {
  const appKit = getAppKit();
  return (
    <AppKitProvider instance={appKit}>
      <Body />
      {/* The modal must sit above everything; on Android with expo-router it needs an absolutely positioned wrapper. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none"><AppKit /></View>
    </AppKitProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md },
  note: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: SPACING.md,
    backgroundColor: COLORS.accentSoft, borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(62,217,184,0.25)',
  },
  noteText: { flex: 1, fontSize: 12.5, color: COLORS.textMuted, lineHeight: 18 },
  card: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, padding: SPACING.md, gap: 10 },
  label: { fontSize: 11, letterSpacing: 1.1, color: COLORS.textDim, fontFamily: FONTS.mono },
  addr: { fontSize: 16, color: COLORS.text, fontFamily: FONTS.mono, fontWeight: '700' },
  linkBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  linkText: { color: COLORS.error, fontSize: 13.5, fontWeight: '600' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.md,
  },
  dollar: { fontFamily: FONTS.mono, fontSize: 22, color: COLORS.textMuted },
  input: { flex: 1, paddingVertical: 14, fontFamily: FONTS.mono, fontSize: 22, color: COLORS.text },
  unit: { fontSize: 13, color: COLORS.textDim },
  hint: { fontSize: 12, color: COLORS.textDim, lineHeight: 17 },
  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingVertical: 16,
  },
  primaryText: { color: COLORS.bg, fontWeight: '700', fontSize: 15.5 },
  off: { opacity: 0.4 },
  error: { color: COLORS.error, fontSize: 12.5 },
  link: { color: COLORS.accent, fontSize: 13.5, fontWeight: '600' },
});
