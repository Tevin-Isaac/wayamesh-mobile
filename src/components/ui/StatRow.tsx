import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '@/constants/theme';

interface Props {
  label: string;
  value?: string;
  mono?: boolean;
  accent?: boolean;
  chevron?: boolean;
  control?: React.ReactNode;
  onPress?: () => void;
}

export function StatRow({ label, value, mono, accent, chevron, control, onPress }: Props) {
  const inner = (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {control ? (
        <View>{control}</View>
      ) : (
        <View style={styles.right}>
          <Text
            style={[styles.value, mono && styles.mono, accent && styles.accentValue]}
            numberOfLines={1}
          >
            {value}
          </Text>
          {chevron && (
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          )}
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    minHeight: 36,
  },
  label:       { fontSize: 14, color: COLORS.textMuted, flexShrink: 0 },
  right:       { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  value: {
    fontSize: 14,
    color: COLORS.text,
    textAlign: 'right',
    flexShrink: 1,
  },
  mono:        { fontFamily: 'monospace', fontSize: 11 },
  accentValue: { color: COLORS.accent },
});
