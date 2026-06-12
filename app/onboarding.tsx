import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Path, Circle, Rect, Defs, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { useWallet } from '@/hooks/useWallet';
import { COLORS, SPACING, RADIUS, FONTS } from '@/constants/theme';

// Transfer arc — quadratic bezier the USDC coin travels.
const P0 = { x: 58, y: 124 }, P1 = { x: 160, y: 36 }, P2 = { x: 262, y: 124 };
const SAMPLES = 24;
const bez = (t: number) => ({
  x: (1 - t) ** 2 * P0.x + 2 * (1 - t) * t * P1.x + t ** 2 * P2.x,
  y: (1 - t) ** 2 * P0.y + 2 * (1 - t) * t * P1.y + t ** 2 * P2.y,
});
const TS = Array.from({ length: SAMPLES + 1 }, (_, i) => i / SAMPLES);
const XS = TS.map((t) => bez(t).x);
const YS = TS.map((t) => bez(t).y);

export default function OnboardingScreen() {
  const { create, isLoading } = useWallet();
  const fade = useRef(new Animated.Value(0)).current;
  const travel = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 800, useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.timing(travel, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const coinX = travel.interpolate({ inputRange: TS, outputRange: XS });
  const coinY = travel.interpolate({ inputRange: TS, outputRange: YS });
  const coinOpacity = travel.interpolate({ inputRange: [0, 0.08, 0.74, 0.86, 1], outputRange: [0, 1, 1, 0, 0] });

  async function handleCreate() {
    await create();
    router.replace('/pin-setup');
  }

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fade }]}>

        {/* top: W logo + WAYAMESH wordmark */}
        <View style={styles.brand}>
          <Image source={require('../assets/wayamesh-w-mint.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.wordmark}>WAYAMESH</Text>
        </View>

        {/* animated transfer arc */}
        <View style={styles.middle}>
          <View style={styles.hero}>
            <Svg width={320} height={210} viewBox="0 0 320 210">
              <Defs>
                <RadialGradient id="recv" cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor={COLORS.accent} stopOpacity={0.55} />
                  <Stop offset="100%" stopColor={COLORS.accent} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              {[[28, 54], [292, 48], [160, 188], [40, 168], [276, 150]].map(([x, y], i) => (
                <Circle key={i} cx={x} cy={y} r={i % 2 ? 2 : 2.6} fill={COLORS.accent} opacity={0.3} />
              ))}
              <Path d="M58 124 Q160 36 262 124" fill="none" stroke={COLORS.border} strokeWidth={1.5} strokeDasharray="5 6" opacity={0.6} />
              <Path d="M58 124 Q160 36 262 124" fill="none" stroke={COLORS.accent} strokeWidth={2} opacity={0.45} />
              <Circle cx={262} cy={124} r={40} fill="url(#recv)" opacity={0.5} />
              <Circle cx={58} cy={124} r={27} fill={COLORS.surface} stroke={COLORS.accent} strokeWidth={1.5} />
              <Rect x={49.5} y={111} width={17} height={26} rx={3.5} fill="none" stroke={COLORS.accent} strokeWidth={1.6} />
              <Circle cx={58} cy={132} r={1.8} fill={COLORS.accent} />
              <Circle cx={160} cy={80} r={16} fill={COLORS.surface} stroke={COLORS.accent} strokeWidth={1.3} strokeOpacity={0.75} />
              <Circle cx={160} cy={80} r={3} fill={COLORS.accent} fillOpacity={0.85} />
              <Circle cx={262} cy={124} r={27} fill={COLORS.surface} stroke={COLORS.accent} strokeWidth={1.5} />
              <Rect x={253.5} y={111} width={17} height={26} rx={3.5} fill="none" stroke={COLORS.accent} strokeWidth={1.6} />
              <Circle cx={262} cy={132} r={1.8} fill={COLORS.accent} />
              <SvgText x={58} y={172} textAnchor="middle" fill={COLORS.textMuted} fontSize={11}>You</SvgText>
              <SvgText x={262} y={172} textAnchor="middle" fill={COLORS.textMuted} fontSize={11}>Anyone</SvgText>
            </Svg>
            <Animated.View style={[styles.coin, { opacity: coinOpacity, transform: [{ translateX: coinX }, { translateY: coinY }] }]}>
              <Text style={styles.coinText}>$</Text>
            </Animated.View>
          </View>

          <Text style={styles.headline}>
            Send money{'\n'}
            <Text style={styles.headlineSerif}>off the grid.</Text>
          </Text>
          <Text style={styles.tagline}>Peer-to-peer · Bluetooth mesh · Arc blockchain</Text>
        </View>

        {/* CTAs */}
        <View style={styles.ctas}>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleCreate} activeOpacity={0.85} disabled={isLoading}>
            <Text style={styles.primaryBtnText}>{isLoading ? 'Creating wallet…' : 'Create Wallet'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={() => router.push('/import')} activeOpacity={0.7}>
            <Text style={styles.ghostBtnText}>Import existing wallet</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const COIN = 30;
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1, justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.xl },

  brand: { alignItems: 'center', gap: SPACING.sm },
  logo: { width: 168, height: 56 },
  wordmark: { fontFamily: FONTS.sans, fontSize: 15, fontWeight: '800', color: COLORS.accent, letterSpacing: 7 },

  middle: { alignItems: 'center', gap: SPACING.sm },
  hero: { width: 320, height: 210 },
  coin: {
    position: 'absolute', top: -COIN / 2, left: -COIN / 2, width: COIN, height: COIN, borderRadius: COIN / 2,
    backgroundColor: '#2775CA', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
  coinText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  headline: { fontSize: 32, fontWeight: '800', color: COLORS.text, textAlign: 'center', lineHeight: 38, letterSpacing: -0.6 },
  headlineSerif: { fontFamily: FONTS.serif, fontWeight: '400', fontSize: 38, color: COLORS.text },
  tagline: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },

  ctas: { width: '100%', gap: SPACING.sm },
  primaryBtn: {
    backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingVertical: 18, alignItems: 'center',
    shadowColor: COLORS.accent, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  primaryBtnText: { color: COLORS.bg, fontWeight: '700', fontSize: 17, letterSpacing: 0.2 },
  ghostBtn: { paddingVertical: 14, alignItems: 'center' },
  ghostBtnText: { color: COLORS.textMuted, fontSize: 15 },
});
