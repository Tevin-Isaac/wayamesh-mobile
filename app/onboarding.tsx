import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing,
  TouchableOpacity, useWindowDimensions, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useWallet } from '@/hooks/useWallet';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

const ACCENT   = COLORS.accent;
const BG       = COLORS.bg;
const RIPPLE_SIZE = 130;

interface Ripple {
  id: number;
  x: number;
  y: number;
  scale: Animated.Value;
  opacity: Animated.Value;
}

export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const { create, isLoading } = useWallet();

  // ── Raindrop ripples ──────────────────────────────────────────────────────
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const rippleId  = useRef(0);
  const lastTouch = useRef(0);

  function spawnRipple(x: number, y: number, delay: number) {
    setTimeout(() => {
      const id      = rippleId.current++;
      const scale   = new Animated.Value(0);
      const opacity = new Animated.Value(0.55);
      setRipples(prev => [...prev.slice(-15), { id, x, y, scale, opacity }]);
      Animated.parallel([
        Animated.timing(scale, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(200),
          Animated.timing(opacity, { toValue: 0, duration: 700, useNativeDriver: true }),
        ]),
      ]).start(() => setRipples(prev => prev.filter(r => r.id !== id)));
    }, delay);
  }

  function handleTouch(x: number, y: number) {
    const now = Date.now();
    if (now - lastTouch.current < 55) return;
    lastTouch.current = now;
    spawnRipple(x, y, 0);
    spawnRipple(x, y, 110);
    spawnRipple(x, y, 220);
  }

  // ── Radar ring pulse ──────────────────────────────────────────────────────
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 700, useNativeDriver: true }).start();

    const makeRingLoop = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 2400,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );

    const l1 = makeRingLoop(ring1, 0);
    const l2 = makeRingLoop(ring2, 800);
    l1.start(); l2.start();
    return () => { l1.stop(); l2.stop(); };
  }, []);

  function radarRing(anim: Animated.Value, baseSize: number) {
    const scale   = anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.5] });
    const opacity = anim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.45, 0.25, 0] });
    return (
      <Animated.View
        style={[
          styles.radarRing,
          {
            width: baseSize, height: baseSize, borderRadius: baseSize / 2,
            transform: [{ scale }],
            opacity,
          },
        ]}
      />
    );
  }

  async function handleCreate() {
    await create();
    // Navigate to PIN setup — the user sets a PIN to encrypt the cloud backup
    router.replace('/pin-setup');
  }

  const LOGO_SIZE = Math.min(width * 0.35, 140);

  return (
    <SafeAreaView style={styles.container}>

      {/* Ripple layer */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {ripples.map(r => (
          <Animated.View
            key={r.id}
            style={[styles.ripple, {
              left: r.x - RIPPLE_SIZE / 2,
              top:  r.y - RIPPLE_SIZE / 2,
              transform: [{ scale: r.scale }],
              opacity: r.opacity,
            }]}
          />
        ))}
      </View>

      {/* Touch capture */}
      <View
        style={StyleSheet.absoluteFillObject}
        onTouchStart={e => handleTouch(e.nativeEvent.pageX, e.nativeEvent.pageY)}
        onTouchMove={e  => handleTouch(e.nativeEvent.pageX, e.nativeEvent.pageY)}
      />

      <Animated.View style={[styles.content, { opacity: fadeIn }]}>

        {/* ── Radar hero ── */}
        <View style={[styles.hero, { height: Math.min(width * 0.7, 280) }]}>
          {radarRing(ring1, LOGO_SIZE * 1.9)}
          {radarRing(ring2, LOGO_SIZE * 1.45)}
          <Image
            source={require('../assets/icon.png')}
            style={{ width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: LOGO_SIZE / 2 }}
          />
        </View>

        {/* ── Wordmark + tagline ── */}
        <View style={styles.textBlock}>
          <Text style={styles.wordmark}>WAYAMESH</Text>
          <Text style={styles.headline}>Send USDC with{'\n'}no internet.</Text>
          <Text style={styles.tagline}>
            Peer-to-peer · Bluetooth mesh · Arc blockchain
          </Text>
        </View>

        {/* ── CTAs ── */}
        <View style={styles.ctas}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleCreate}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryBtnText}>
              {isLoading ? 'Creating wallet…' : 'Create Wallet'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ghostBtn}
            onPress={() => router.push('/import')}
            activeOpacity={0.7}
          >
            <Text style={styles.ghostBtnText}>Import existing wallet</Text>
          </TouchableOpacity>
        </View>

      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: SPACING.xl,
    paddingTop: SPACING.sm,
  },

  // Touch ripple
  ripple: {
    position: 'absolute',
    width:  RIPPLE_SIZE,
    height: RIPPLE_SIZE,
    borderRadius: RIPPLE_SIZE / 2,
    borderWidth: 1.2,
    borderColor: ACCENT,
  },

  // Radar hero
  hero: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: ACCENT,
    borderStyle: 'dashed',
  },

  // Text
  textBlock: { alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.xl },
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
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Buttons
  ctas:  { width: '100%', paddingHorizontal: SPACING.lg, gap: SPACING.sm },
  primaryBtn: {
    backgroundColor: ACCENT,
    borderRadius: RADIUS.md,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: ACCENT,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  primaryBtnText: { color: BG, fontWeight: '700', fontSize: 17, letterSpacing: 0.2 },
  ghostBtn:       { paddingVertical: 14, alignItems: 'center' },
  ghostBtnText:   { color: COLORS.textMuted, fontSize: 15 },
});
