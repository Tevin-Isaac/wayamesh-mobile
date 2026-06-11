import { Text, StyleSheet, View } from 'react-native';
import { COLORS, RADIUS } from '@/constants/theme';

type Status = 'pending' | 'relayed' | 'settled' | 'failed' | 'accent' | 'neutral';

const MAP: Record<Status, { color: string; bg: string; border: string }> = {
  pending: { color: COLORS.warning,  bg: COLORS.warningSoft, border: 'rgba(245,166,35,0.3)' },
  relayed: { color: COLORS.pending,  bg: COLORS.pendingSoft, border: 'rgba(167,139,250,0.3)' },
  settled: { color: COLORS.success,  bg: COLORS.accentSoft,  border: 'rgba(62,217,184,0.3)'  },
  failed:  { color: COLORS.error,    bg: COLORS.errorSoft,   border: 'rgba(255,77,106,0.3)'  },
  accent:  { color: COLORS.accent,   bg: COLORS.accentSoft,  border: 'rgba(62,217,184,0.3)'  },
  neutral: { color: COLORS.textMuted, bg: 'transparent',     border: COLORS.border           },
};

interface Props {
  status?: Status;
  children: string;
}

export function Badge({ status = 'neutral', children }: Props) {
  const { color, bg, border } = MAP[status];
  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.label, { color }]}>{children.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: RADIUS.full,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: 'monospace',
    lineHeight: 14,
  },
});
