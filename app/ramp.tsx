import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '@/hooks/useWallet';
import { Eyebrow } from '@/components/pro';
import { getRampConfig, buildBuyUrl, buildSellUrl, FAUCET_URL } from '@/constants/ramp';
import { COLORS, SPACING, RADIUS, FONTS } from '@/constants/theme';

// Add money (on-ramp) / Cash out (off-ramp). Live mode opens a licensed
// provider's hosted flow with the user's address pre-filled — self-custody is
// preserved; we never touch fiat. Without a provider key (testnet), the screen
// offers the Circle faucet path instead.

export default function RampScreen() {
  const { address } = useWallet();
  const cfg = getRampConfig();
  const live = !!cfg && !!address;

  function openBuy() {
    if (cfg && address) Linking.openURL(buildBuyUrl(cfg, address));
    else Linking.openURL(FAUCET_URL);
  }
  function openSell() {
    if (cfg && address) Linking.openURL(buildSellUrl(cfg, address));
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {!live && (
          <View style={styles.banner}>
            <Ionicons name="flask-outline" size={16} color={COLORS.warning} />
            <Text style={styles.bannerText}>
              Testnet mode — real-money on/off-ramp activates at mainnet with a
              provider key. For now, top up free from the Circle faucet.
            </Text>
          </View>
        )}

        <Eyebrow style={styles.eyebrow}>Add money</Eyebrow>
        <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={openBuy}>
          <View style={[styles.cardIcon, styles.cardIconBuy]}>
            <Ionicons name="arrow-down-circle-outline" size={24} color={COLORS.accent} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{live ? 'Buy USDC' : 'Get testnet USDC'}</Text>
            <Text style={styles.cardSub}>
              {live
                ? 'Card, bank, or mobile money — USDC lands straight in your wallet.'
                : 'Free from Circle\'s faucet — 20 USDC per address every 2 hours.'}
            </Text>
          </View>
          <Ionicons name="open-outline" size={18} color={COLORS.textDim} />
        </TouchableOpacity>

        <Eyebrow style={styles.eyebrow}>Cash out</Eyebrow>
        <TouchableOpacity
          style={[styles.card, !live && styles.cardDisabled]}
          activeOpacity={live ? 0.8 : 1}
          onPress={live ? openSell : undefined}
        >
          <View style={[styles.cardIcon, styles.cardIconSell]}>
            <Ionicons name="arrow-up-circle-outline" size={24} color={live ? COLORS.warning : COLORS.textDim} />
          </View>
          <View style={styles.cardBody}>
            <Text style={[styles.cardTitle, !live && styles.cardTitleDim]}>Sell USDC</Text>
            <Text style={styles.cardSub}>
              {live
                ? 'Withdraw to your bank or mobile money via the provider.'
                : 'Available at mainnet launch.'}
            </Text>
          </View>
          {live && <Ionicons name="open-outline" size={18} color={COLORS.textDim} />}
        </TouchableOpacity>

        <View style={styles.note}>
          <Ionicons name="shield-checkmark-outline" size={15} color={COLORS.textDim} />
          <Text style={styles.noteText}>
            Purchases and payouts are processed by a licensed provider. Your keys
            and funds stay in your custody — USDC is delivered directly to your
            address{address ? ` (${address.slice(0, 8)}…${address.slice(-6)})` : ''}.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.sm },

  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: COLORS.warningSoft, borderWidth: 1, borderColor: 'rgba(245,166,35,0.3)',
    borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm,
  },
  bannerText: { flex: 1, fontSize: 12.5, color: COLORS.warning, lineHeight: 18 },

  eyebrow: { marginTop: SPACING.md, marginBottom: 2 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, padding: SPACING.md,
  },
  cardDisabled: { opacity: 0.55 },
  cardIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardIconBuy: { backgroundColor: COLORS.accentSoft },
  cardIconSell: { backgroundColor: COLORS.warningSoft },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  cardTitleDim: { color: COLORS.textMuted },
  cardSub: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2, lineHeight: 18 },

  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: SPACING.lg, paddingHorizontal: 2 },
  noteText: { flex: 1, fontSize: 12, color: COLORS.textDim, lineHeight: 18, fontFamily: FONTS.sans },
});
