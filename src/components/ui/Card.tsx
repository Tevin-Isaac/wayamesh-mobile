import { View, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, RADIUS, SPACING } from '@/constants/theme';

type Tone = 'default' | 'warning' | 'error' | 'pending';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  accent?: boolean;
  tone?: Tone;
  padding?: number;
}

const TONES: Record<Tone, { bg: string; border: string }> = {
  default: { bg: COLORS.surface,     border: COLORS.border },
  warning: { bg: COLORS.warningSoft, border: 'rgba(245,166,35,0.3)' },
  error:   { bg: COLORS.errorSoft,   border: 'rgba(255,77,106,0.3)' },
  pending: { bg: COLORS.pendingSoft, border: 'rgba(167,139,250,0.3)' },
};

export function Card({ children, style, accent, tone = 'default', padding }: Props) {
  const { bg, border } = TONES[tone];
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: bg, borderColor: accent ? COLORS.accent : border },
        accent && styles.accentGlow,
        padding !== undefined && { padding },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
  },
  accentGlow: {
    shadowColor: COLORS.accent,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
});
