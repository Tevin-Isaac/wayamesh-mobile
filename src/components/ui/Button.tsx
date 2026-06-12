import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  leadingIcon?: React.ReactNode;
}

export function Button({ title, onPress, variant = 'primary', size = 'md', loading, disabled, style, leadingIcon }: Props) {
  const off = disabled || loading;
  return (
    <TouchableOpacity
      style={[styles.base, size === 'lg' && styles.lg, styles[variant], off && styles.disabled, style]}
      onPress={onPress}
      disabled={off}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? COLORS.bg : COLORS.accent}
          size="small"
        />
      ) : (
        <View style={styles.inner}>
          {leadingIcon}
          <Text style={[
            styles.label,
            size === 'lg' && styles.labelLg,
            variant !== 'primary' && styles.labelAlt,
            variant === 'danger' && styles.labelDanger,
          ]}>
            {title}
          </Text>
        </View>
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
  lg: { paddingVertical: 18, minHeight: 56 },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primary: {
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: COLORS.errorSoft,
    borderWidth: 1,
    borderColor: 'rgba(255,77,106,0.3)',
  },
  disabled: { opacity: 0.4 },
  label:       { color: COLORS.bg,    fontWeight: '700', fontSize: 16, letterSpacing: 0.2 },
  labelLg:     { fontSize: 17 },
  labelAlt:    { color: COLORS.accent },
  labelDanger: { color: COLORS.error },
});
