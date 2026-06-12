import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop } from 'react-native-svg';
import { COLORS, FONTS } from '@/constants/theme';

// ── Shared Pro primitives — the elevated Wayamesh design language ─────────────

export function labelFor(seed: string): string {
  const s = (seed || '').trim();
  if (/^0x[0-9a-fA-F]+/.test(s)) return s.slice(2, 4).toUpperCase();
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (s.slice(0, 2) || '··').toUpperCase();
}

export function Avatar({
  seed, size = 44, dir,
}: { seed: string; size?: number; dir?: 'out' | 'in' }) {
  const badge = size * 0.42;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.34 }]}>{labelFor(seed)}</Text>
      {dir && (
        <View style={[styles.dirBadge, { width: badge, height: badge, borderRadius: badge / 2, bottom: -2, right: -2 }]}>
          <Ionicons
            name={dir === 'out' ? 'arrow-up' : 'arrow-down'}
            size={badge * 0.62}
            color={dir === 'out' ? COLORS.warning : COLORS.success}
          />
        </View>
      )}
    </View>
  );
}

export function Eyebrow({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <Text style={[styles.eyebrow, style]}>{children}</Text>;
}

export function QuickAction({
  icon, label, onPress, primary,
}: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <TouchableOpacity style={styles.qa} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.qaTile, primary ? styles.qaTilePrimary : styles.qaTileAlt]}>
        <Ionicons name={icon} size={22} color={primary ? COLORS.bg : COLORS.accent} />
      </View>
      <Text style={styles.qaLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const STATUS: Record<string, { color: string; label: string }> = {
  pending: { color: COLORS.warning, label: 'Pending' },
  relayed: { color: COLORS.pending, label: 'Relayed' },
  settled: { color: COLORS.success, label: 'Settled' },
  failed:  { color: COLORS.error,   label: 'Failed' },
};

export function StatusDot({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.pending;
  return (
    <View style={styles.statusRow}>
      <View style={[styles.statusDotMark, { backgroundColor: s.color }]} />
      <Text style={[styles.statusLabel, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

/** Minimal area sparkline. Renders nothing for fewer than 2 points. */
export function Sparkline({
  points, width = 320, height = 44,
}: { points: number[]; width?: number; height?: number }) {
  if (!points || points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const stepX = width / (points.length - 1);
  const y = (v: number) => height - 6 - ((v - min) / span) * (height - 12);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * stepX).toFixed(1)} ${y(p).toFixed(1)}`).join(' ');
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <Defs>
        <SvgGrad id="spark" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={COLORS.accent} stopOpacity={0.35} />
          <Stop offset="1" stopColor={COLORS.accent} stopOpacity={0} />
        </SvgGrad>
      </Defs>
      <Path d={area} fill="url(#spark)" />
      <Path d={line} fill="none" stroke={COLORS.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.accentSoft,
    borderWidth: 1, borderColor: 'rgba(62,217,184,0.35)',
  },
  avatarText: { color: COLORS.accent, fontWeight: '700', letterSpacing: 0.3 },
  dirBadge: {
    position: 'absolute', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border,
  },

  eyebrow: {
    fontSize: 11, fontWeight: '600', color: COLORS.textDim,
    textTransform: 'uppercase', letterSpacing: 1.2,
  },

  qa: { flex: 1, alignItems: 'center', gap: 8 },
  qaTile: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  qaTilePrimary: {
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  qaTileAlt: { backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.border },
  qaLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500' },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDotMark: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 11, fontFamily: FONTS.mono },
});
