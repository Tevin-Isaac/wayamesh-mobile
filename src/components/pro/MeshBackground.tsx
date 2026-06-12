import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { COLORS } from '@/constants/theme';

const ACircle = Animated.createAnimatedComponent(Circle);
const ALine = Animated.createAnimatedComponent(Line);

// Logical canvas — scaled to cover the screen via preserveAspectRatio="slice".
const W = 360;
const H = 760;

// Base node positions and a fixed edge topology (a living mesh of the logo).
const NODES = [
  { x: 40, y: 90 }, { x: 150, y: 60 }, { x: 300, y: 110 },
  { x: 90, y: 220 }, { x: 250, y: 205 }, { x: 180, y: 330 },
  { x: 50, y: 430 }, { x: 310, y: 405 }, { x: 150, y: 520 },
  { x: 285, y: 560 }, { x: 70, y: 640 }, { x: 215, y: 680 },
];
const EDGES: [number, number][] = [
  [0, 1], [1, 2], [0, 3], [1, 4], [2, 4], [3, 5], [4, 5],
  [3, 6], [5, 8], [4, 7], [7, 9], [6, 8], [8, 9], [8, 11], [10, 8], [9, 11], [6, 10],
];

export function MeshBackground({ style }: { style?: ViewStyle }) {
  const pts = useRef(NODES.map((n) => new Animated.ValueXY({ x: n.x, y: n.y }))).current;

  useEffect(() => {
    const anims = pts.map((v, i) => {
      const amp = 8 + (i % 3) * 6;
      const dur = 4200 + ((i * 730) % 4200);
      const dx = (i % 2 ? 1 : -1) * amp;
      const dy = (i % 3 ? -1 : 1) * amp;
      return Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: { x: NODES[i].x + dx, y: NODES[i].y + dy }, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
          Animated.timing(v, { toValue: { x: NODES[i].x, y: NODES[i].y }, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        ]),
      );
    });
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, []);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        {EDGES.map(([a, b], i) => (
          <ALine
            key={`e${i}`}
            x1={pts[a].x} y1={pts[a].y} x2={pts[b].x} y2={pts[b].y}
            stroke={COLORS.accent} strokeWidth={1} strokeOpacity={0.1}
          />
        ))}
        {pts.map((v, i) => (
          <ACircle key={`n${i}`} cx={v.x} cy={v.y} r={2.6} fill={COLORS.accent} fillOpacity={0.3} />
        ))}
      </Svg>
    </View>
  );
}
