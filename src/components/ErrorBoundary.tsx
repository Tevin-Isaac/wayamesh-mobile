import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

// A render error anywhere below must never leave the user with a blank, permanently broken app (the security review found a
// stranger's malformed chat message crashing the whole app). The boundary shows a recoverable screen instead.

interface Props { children: React.ReactNode; label?: string }
interface State { error: Error | null }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    // Never log message content; the error text only.
    console.warn('ErrorBoundary caught:', error.message);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Something went wrong{this.props.label ? ` in ${this.props.label}` : ''}</Text>
        <Text style={styles.body}>Your wallet and funds are not affected. Try again; if it keeps happening, restart the app.</Text>
        <TouchableOpacity style={styles.btn} onPress={() => this.setState({ error: null })} activeOpacity={0.85}>
          <Text style={styles.btnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg, gap: SPACING.md },
  title: { color: COLORS.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  body: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  btn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingVertical: 12, paddingHorizontal: 28 },
  btnText: { color: COLORS.bg, fontWeight: '700' },
});
