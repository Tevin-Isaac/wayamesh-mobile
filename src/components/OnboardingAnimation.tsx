import { useEffect, useRef } from 'react';
import { Animated, Easing, useWindowDimensions } from 'react-native';
import Svg, {
  Circle, Path, G, Defs, LinearGradient, Stop,
  RadialGradient, Rect, Line,
} from 'react-native-svg';

const ACCENT = '#3ED9B8';
const ACCENT_DIM = 'rgba(62,217,184,0.15)';
const BG = '#07070F';

// Animated wrappers
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

interface Props {
  coinProgress: Animated.Value; // 0 → 1, sender to receiver
  pulseAnim: Animated.Value;
  particleAnims: Animated.Value[];
}

export function OnboardingAnimation({ coinProgress, pulseAnim, particleAnims }: Props) {
  const { width, height } = useWindowDimensions();

  // Layout constants
  const animH = height * 0.42;
  const cy = animH / 2;
  const senderX = width * 0.18;
  const receiverX = width * 0.82;
  const midX = width / 2;
  const curveY = cy - animH * 0.22;

  // Cubic bezier: sender → arc peak → receiver
  function bezier(t: number) {
    const p0x = senderX, p0y = cy;
    const p1x = midX, p1y = curveY;
    const p2x = receiverX, p2y = cy;
    const mt = 1 - t;
    return {
      x: mt * mt * p0x + 2 * mt * t * p1x + t * t * p2x,
      y: mt * mt * p0y + 2 * mt * t * p1y + t * t * p2y,
    };
  }

  // Coin position interpolated from progress
  const coinX = coinProgress.interpolate({
    inputRange: Array.from({ length: 21 }, (_, i) => i / 20),
    outputRange: Array.from({ length: 21 }, (_, i) => bezier(i / 20).x),
  });
  const coinY = coinProgress.interpolate({
    inputRange: Array.from({ length: 21 }, (_, i) => i / 20),
    outputRange: Array.from({ length: 21 }, (_, i) => bezier(i / 20).y),
  });

  const nodeScale = pulseAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.08, 1],
  });

  const receiverGlow = coinProgress.interpolate({
    inputRange: [0, 0.85, 1],
    outputRange: [0, 0, 1],
  });

  const pathD = `M ${senderX} ${cy} Q ${midX} ${curveY} ${receiverX} ${cy}`;

  // Background mesh particle positions
  const particles = [
    { bx: width * 0.12, by: animH * 0.2 },
    { bx: width * 0.85, by: animH * 0.15 },
    { bx: width * 0.5,  by: animH * 0.85 },
    { bx: width * 0.25, by: animH * 0.75 },
    { bx: width * 0.7,  by: animH * 0.65 },
    { bx: width * 0.4,  by: animH * 0.1  },
  ];

  return (
    <Svg width={width} height={animH} viewBox={`0 0 ${width} ${animH}`}>
      <Defs>
        <RadialGradient id="bg_glow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={ACCENT} stopOpacity="0.08" />
          <Stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="sender_glow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={ACCENT} stopOpacity="0.3" />
          <Stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="receiver_glow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={ACCENT} stopOpacity="0.5" />
          <Stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id="path_grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={ACCENT} stopOpacity="0.6" />
          <Stop offset="50%" stopColor={ACCENT} stopOpacity="1" />
          <Stop offset="100%" stopColor={ACCENT} stopOpacity="0.6" />
        </LinearGradient>
      </Defs>

      {/* Background glow */}
      <Rect x={0} y={0} width={width} height={animH} fill="url(#bg_glow)" />

      {/* Subtle grid lines */}
      {Array.from({ length: 6 }, (_, i) => (
        <Line
          key={`vl${i}`}
          x1={width * (i + 1) / 7} y1={0}
          x2={width * (i + 1) / 7} y2={animH}
          stroke={ACCENT} strokeWidth={0.4} strokeOpacity={0.06}
        />
      ))}
      {Array.from({ length: 4 }, (_, i) => (
        <Line
          key={`hl${i}`}
          x1={0} y1={animH * (i + 1) / 5}
          x2={width} y2={animH * (i + 1) / 5}
          stroke={ACCENT} strokeWidth={0.4} strokeOpacity={0.06}
        />
      ))}

      {/* Floating background particles */}
      {particles.map((p, i) => {
        const floatY = particleAnims[i]?.interpolate({
          inputRange: [0, 1],
          outputRange: [p.by, p.by - 18],
        }) ?? p.by;
        const floatOpacity = particleAnims[i]?.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0.12, 0.35, 0.12],
        }) ?? 0.12;
        return (
          <AnimatedCircle
            key={`p${i}`}
            cx={p.bx}
            cy={floatY as unknown as number}
            r={i % 2 === 0 ? 2.5 : 1.8}
            fill={ACCENT}
            fillOpacity={floatOpacity as unknown as number}
          />
        );
      })}

      {/* Transaction path (dashed arc) */}
      <Path
        d={pathD}
        stroke={ACCENT}
        strokeWidth={1.5}
        strokeDasharray="6 5"
        strokeOpacity={0.3}
        fill="none"
      />
      {/* Glowing path overlay */}
      <Path
        d={pathD}
        stroke="url(#path_grad)"
        strokeWidth={2.5}
        strokeOpacity={0.15}
        fill="none"
      />

      {/* Sender node glow */}
      <Circle cx={senderX} cy={cy} r={52} fill="url(#sender_glow)" />

      {/* Sender node */}
      <Animated.View
        style={{
          position: 'absolute',
          left: senderX - 28,
          top: cy - 28,
          transform: [{ scale: nodeScale }],
        }}
      >
        <Svg width={56} height={56}>
          <Circle cx={28} cy={28} r={28} fill={BG} />
          <Circle cx={28} cy={28} r={26} fill="none" stroke={ACCENT} strokeWidth={1.5} strokeOpacity={0.8} />
          {/* Phone icon simplified */}
          <Rect x={18} y={12} width={20} height={32} rx={4} fill="none" stroke={ACCENT} strokeWidth={1.8} />
          <Circle cx={28} cy={38} r={2} fill={ACCENT} fillOpacity={0.8} />
        </Svg>
      </Animated.View>

      {/* Receiver node glow — brightens when coin arrives */}
      <AnimatedCircle
        cx={receiverX}
        cy={cy}
        r={60}
        fill={ACCENT}
        fillOpacity={receiverGlow as unknown as number}
      />
      <Circle cx={receiverX} cy={cy} r={52} fill="url(#receiver_glow)" />

      {/* Receiver node */}
      <Circle cx={receiverX} cy={cy} r={28} fill={BG} />
      <Circle cx={receiverX} cy={cy} r={26} fill="none" stroke={ACCENT} strokeWidth={1.5} strokeOpacity={0.8} />
      <Rect x={receiverX - 10} y={cy - 16} width={20} height={32} rx={4} fill="none" stroke={ACCENT} strokeWidth={1.8} />
      <Circle cx={receiverX} cy={cy + 10} r={2} fill={ACCENT} fillOpacity={0.8} />

      {/* USDC coin moving along path */}
      <AnimatedCircle
        cx={coinX as unknown as number}
        cy={coinY as unknown as number}
        r={16}
        fill={BG}
        stroke={ACCENT}
        strokeWidth={2.5}
      />
      {/* USDC $ symbol — inner ring */}
      <AnimatedCircle
        cx={coinX as unknown as number}
        cy={coinY as unknown as number}
        r={10}
        fill="none"
        stroke={ACCENT}
        strokeWidth={1.5}
        strokeOpacity={0.6}
      />
      {/* Center dot */}
      <AnimatedCircle
        cx={coinX as unknown as number}
        cy={coinY as unknown as number}
        r={3}
        fill={ACCENT}
      />

      {/* Sender label */}
      {/* Labels are handled in JS/RN layer — SVG text font support is limited */}
    </Svg>
  );
}
