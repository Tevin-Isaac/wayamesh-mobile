import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, RADIUS, SPACING } from '@/constants/theme';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, style }: Props) {
  return (
    <TouchableOpacity
      style={[styles.base, styles[variant], (disabled || loading) && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? COLORS.bg : COLORS.accent} size="small" />
      ) : (
        <Text style={[styles.label, variant !== 'primary' && styles.labelAlt]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primary: {
    backgroundColor: COLORS.accent,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    color: COLORS.bg,
    fontWeight: '700',
    fontSize: 16,
  },
  labelAlt: {
    color: COLORS.accent,
  },
});
