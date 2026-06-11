import { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet,
  TextInputProps, ViewStyle,
} from 'react-native';
import { COLORS, RADIUS, SPACING } from '@/constants/theme';

interface Props extends TextInputProps {
  label?: string;
  hint?: string;
  hintActive?: boolean;
  error?: boolean;
  mono?: boolean;
  containerStyle?: ViewStyle;
  rightSlot?: React.ReactNode;
}

export function Input({
  label, hint, hintActive, error, mono,
  containerStyle, rightSlot, style, ...rest
}: Props) {
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? COLORS.error
    : focused
    ? COLORS.accent
    : COLORS.border;

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label && (
        <Text style={styles.label}>{label}</Text>
      )}
      <View style={[styles.inputRow, { borderColor }]}>
        <TextInput
          style={[styles.input, mono && styles.mono, style]}
          placeholderTextColor={COLORS.textDim}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
        {rightSlot && <View style={styles.slot}>{rightSlot}</View>}
      </View>
      {hint && (
        <Text style={[styles.hint, (hintActive && !error) && styles.hintActive, error && styles.hintError]}>
          {hint}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: SPACING.xs },
  label: {
    fontSize: 13,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
  },
  input: {
    flex: 1,
    paddingVertical: SPACING.md,
    color: COLORS.text,
    fontSize: 15,
    minHeight: 50,
  },
  mono: { fontFamily: 'monospace', fontSize: 13 },
  slot: { paddingLeft: SPACING.sm },
  hint:       { fontSize: 12, color: COLORS.textDim },
  hintActive: { color: COLORS.accent },
  hintError:  { color: COLORS.error },
});
