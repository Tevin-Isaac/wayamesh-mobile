import { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing,
  TouchableOpacity, useWindowDimensions, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, {
  Circle, Path, Rect, Line, Defs,
  RadialGradient, LinearGradient, Stop,
} from 'react-native-svg';
import { useWallet } from '@/hooks/useWallet';
import { COLORS, SPACING } from '@/constants/theme';

const ACCENT = '#3ED9B8';
const BG = '#07070F';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function OnboardingScreen() {
  const { width, height } = useWindowDimensions();
  const { create, isLoading } = useWallet();

  // Animation values
  const coinProgress = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const logoSpin = useRef(new Animated.Value(0)).current;
  const particleAnims = useRef(
    Array.from({ length: 6 }, () => new Animated.Value(0))
  ).current;

  // Layout
  const animH = Math.min(height * 0.40, 300);
  const nodeY = animH / 2;
  const senderX = width * 0.18;
  const receiverX = width * 0.82;
  const midX = width / 2;
  const curveY = nodeY - animH * 0.28;

  // Bezier interpolation for coin path
  function bezierPoints() {
    const steps = 30;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      xs.push(mt * mt * senderX + 2 * mt * t * midX + t * t * receiverX);
      ys.push(mt * mt * nodeY + 2 * mt * t * curveY + t * t * nodeY);
    }
    return { xs, ys };
  }

  const { xs, ys } = bezierPoints();
  const inputRange = xs.map((_, i) => i / (xs.length - 1));

  const coinX = coinProgress.interpolate({ inputRange, outputRange: xs });
  const coinY = coinProgress.interpolate({ inputRange, outputRange: ys });

  const receiverGlow = coinProgress.interpolate({
    inputRange: [0, 0.82, 1],
    outputRange: [0, 0, 0.18],
  });
  const coinOpacity = coinProgress.interpolate({
    inputRange: [0, 0.05, 0.9, 1],
    outputRange: [0, 1, 1, 0],
  });
  const nodeScale = pulseAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.07, 1],
  });
  const spinDeg = logoSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const pathD = `M ${senderX} ${nodeY} Q ${midX} ${curveY} ${receiverX} ${nodeY}`;

  const particles = [
    { bx: width * 0.08, by: animH * 0.18 },
    { bx: width * 0.88, by: animH * 0.12 },
    { bx: width * 0.52, by: animH * 0.88 },
    { bx: width * 0.22, by: animH * 0.78 },
    { bx: width * 0.72, by: animH * 0.70 },
    { bx: width * 0.38, by: animH * 0.08 },
  ];

  useEffect(() => {
    // Fade in
    Animated.timing(fadeIn, {
      toValue: 1, duration: 800, useNativeDriver: true,
    }).start();

    // Coin travels sender → receiver on loop
    const coinLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(600),
        Animated.timing(coinProgress, {
          toValue: 1, duration: 1800,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.delay(500),
        Animated.timing(coinProgress, {
          toValue: 0, duration: 0, useNativeDriver: false,
        }),
      ])
    );

    // Node pulse
    const pulse = Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1, duration: 2200,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      })
    );

    // Logo spin (slow)
    const spin = Animated.loop(
      Animated.timing(logoSpin, {
        toValue: 1, duration: 12000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    // Particles float up/down independently
    const particleLoops = particleAnims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1, duration: 3000 + i * 600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
          Animated.timing(anim, {
            toValue: 0, duration: 3000 + i * 600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
        ])
      )
    );

    coinLoop.start();
    pulse.start();
    spin.start();
    particleLoops.forEach(l => l.start());

    return () => {
      coinLoop.stop();
      pulse.stop();
      spin.stop();
      particleLoops.forEach(l => l.stop());
    };
  }, []);

  async function handleCreate() {
    await create();
    router.replace('/(tabs)');
  }

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeIn }]}>

        {/* Animation canvas */}
        <View style={[styles.animCanvas, { height: animH }]}>
          <Svg width={width} height={animH}>
            <Defs>
              <RadialGradient id="bg_glow" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={ACCENT} stopOpacity="0.1" />
                <Stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
              </RadialGradient>
              <RadialGradient id="sender_halo" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={ACCENT} stopOpacity="0.25" />
                <Stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
              </RadialGradient>
              <LinearGradient id="path_grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor={ACCENT} stopOpacity="0.4" />
                <Stop offset="50%" stopColor={ACCENT} stopOpacity="0.9" />
                <Stop offset="100%" stopColor={ACCENT} stopOpacity="0.4" />
              </LinearGradient>
            </Defs>

            {/* Background ambient glow */}
            <Rect x={0} y={0} width={width} height={animH} fill="url(#bg_glow)" />

            {/* Grid */}
            {Array.from({ length: 7 }, (_, i) => (
              <Line key={`v${i}`} x1={width*(i+1)/8} y1={0} x2={width*(i+1)/8} y2={animH}
                stroke={ACCENT} strokeWidth={0.5} strokeOpacity={0.05} />
            ))}
            {Array.from({ length: 4 }, (_, i) => (
              <Line key={`h${i}`} x1={0} y1={animH*(i+1)/5} x2={width} y2={animH*(i+1)/5}
                stroke={ACCENT} strokeWidth={0.5} strokeOpacity={0.05} />
            ))}

            {/* Floating particles */}
            {particles.map((p, i) => {
              const fy = particleAnims[i].interpolate({
                inputRange: [0, 1], outputRange: [p.by, p.by - 16],
              });
              const fo = particleAnims[i].interpolate({
                inputRange: [0, 0.5, 1], outputRange: [0.1, 0.35, 0.1],
              });
              return (
                <AnimatedCircle key={`pt${i}`}
                  cx={p.bx}
                  cy={fy as unknown as number}
                  r={i % 2 === 0 ? 2.5 : 1.8}
                  fill={ACCENT}
                  fillOpacity={fo as unknown as number}
                />
              );
            })}

            {/* Transaction arc path */}
            <Path d={pathD} stroke={ACCENT} strokeWidth={1.5}
              strokeDasharray="7 5" strokeOpacity={0.25} fill="none" />
            <Path d={pathD} stroke="url(#path_grad)"
              strokeWidth={2} strokeOpacity={0.12} fill="none" />

            {/* Sender halo */}
            <Circle cx={senderX} cy={nodeY} r={50} fill="url(#sender_halo)" />

            {/* Receiver halo — glows when coin arrives */}
            <AnimatedCircle cx={receiverX} cy={nodeY} r={58}
              fill={ACCENT}
              fillOpacity={receiverGlow as unknown as number}
            />
            <Circle cx={receiverX} cy={nodeY} r={50} fill="url(#sender_halo)" />

            {/* Sender phone node */}
            <Circle cx={senderX} cy={nodeY} r={28} fill={BG} />
            <Circle cx={senderX} cy={nodeY} r={26} fill="none" stroke={ACCENT} strokeWidth={1.5} strokeOpacity={0.85} />
            <Rect x={senderX-9} y={nodeY-14} width={18} height={28} rx={3}
              fill="none" stroke={ACCENT} strokeWidth={1.6} />
            <Circle cx={senderX} cy={nodeY+10} r={2} fill={ACCENT} fillOpacity={0.8} />

            {/* Receiver phone node */}
            <Circle cx={receiverX} cy={nodeY} r={28} fill={BG} />
            <Circle cx={receiverX} cy={nodeY} r={26} fill="none" stroke={ACCENT} strokeWidth={1.5} strokeOpacity={0.85} />
            <Rect x={receiverX-9} y={nodeY-14} width={18} height={28} rx={3}
              fill="none" stroke={ACCENT} strokeWidth={1.6} />
            <Circle cx={receiverX} cy={nodeY+10} r={2} fill={ACCENT} fillOpacity={0.8} />

            {/* USDC coin on path */}
            <AnimatedCircle
              cx={coinX as unknown as number}
              cy={coinY as unknown as number}
              r={15}
              fill={BG}
              stroke={ACCENT}
              strokeWidth={2.5}
              fillOpacity={coinOpacity as unknown as number}
              strokeOpacity={coinOpacity as unknown as number}
            />
            <AnimatedCircle
              cx={coinX as unknown as number}
              cy={coinY as unknown as number}
              r={9}
              fill="none"
              stroke={ACCENT}
              strokeWidth={1.2}
              strokeOpacity={coinOpacity as unknown as number}
            />
            <AnimatedCircle
              cx={coinX as unknown as number}
              cy={coinY as unknown as number}
              r={3.5}
              fill={ACCENT}
              fillOpacity={coinOpacity as unknown as number}
            />
          </Svg>

          {/* Sender / Receiver labels — RN Text over SVG */}
          <Text style={[styles.nodeLabel, { left: senderX - 30, top: nodeY + 36 }]}>
            Sender
          </Text>
          <Text style={[styles.nodeLabel, { left: receiverX - 36, top: nodeY + 36 }]}>
            Receiver
          </Text>
          <Text style={[styles.usdcLabel, { left: midX - 22, top: curveY - 28 }]}>
            USDC
          </Text>
        </View>

        {/* Wordmark + tagline */}
        <View style={styles.textBlock}>
          <Animated.View style={{ transform: [{ rotate: spinDeg }], marginBottom: SPACING.sm }}>
            <View style={styles.logoRing}>
              <View style={styles.logoDot} />
            </View>
          </Animated.View>

          <Text style={styles.wordmark}>WAYAMESH</Text>
          <Text style={styles.headline}>Send USDC with{'\n'}no internet.</Text>
          <Text style={styles.tagline}>
            Peer-to-peer · Bluetooth mesh · Arc blockchain
          </Text>
        </View>

        {/* CTAs */}
        <View style={styles.ctas}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleCreate}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>
              {isLoading ? 'Creating wallet...' : 'Create Wallet'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.push('/import')}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryBtnText}>Import existing wallet</Text>
          </TouchableOpacity>
        </View>

      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: SPACING.xl,
  },
  animCanvas: {
    width: '100%',
    position: 'relative',
  },
  nodeLabel: {
    position: 'absolute',
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    width: 60,
    textAlign: 'center',
  },
  usdcLabel: {
    position: 'absolute',
    fontSize: 10,
    color: ACCENT,
    letterSpacing: 1,
    fontWeight: '700',
    width: 44,
    textAlign: 'center',
  },
  textBlock: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.sm,
  },
  logoRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
  },
  logoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ACCENT,
  },
  wordmark: {
    fontSize: 13,
    fontWeight: '800',
    color: ACCENT,
    letterSpacing: 6,
  },
  headline: {
    fontSize: 30,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  ctas: {
    width: '100%',
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  primaryBtn: {
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: ACCENT,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  primaryBtnText: {
    color: BG,
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
});
