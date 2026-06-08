import { View, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, RADIUS, SPACING } from '@/constants/theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  accent?: boolean;
}

export function Card({ children, style, accent }: Props) {
  return (
    <View style={[styles.card, accent && styles.cardAccent, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardAccent: {
    borderColor: COLORS.accent,
    borderWidth: 1,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
});
