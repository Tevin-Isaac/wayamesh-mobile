import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import { getLimits, setLimits, isRaise } from '@/wallet/limits';
import { getAcceptLimit, setAcceptLimit } from '@/db/appSettings';
import { formatUsdc } from '@/mesh/voucher';
import { requireReauth } from '@/utils/reauth';

// Spending limits (per payment, per 24h) and the accept limit (unsettled offline value held per payer).
// Lowering is free. RAISING any of them needs a fresh biometric/passcode check, so a borrowed phone cannot loosen them.

export default function LimitsScreen() {
  const cur = getLimits();
  const [perTx, setPerTx] = useState(formatUsdc(cur.perTx).replace(/\.0$/, ''));
  const [daily, setDaily] = useState(formatUsdc(cur.daily).replace(/\.0$/, ''));
  const [accept, setAccept] = useState(String(getAcceptLimit()));

  async function save() {
    try {
      const a = Number(accept);
      const raising = isRaise(perTx, daily) || a > getAcceptLimit();
      if (raising && !(await requireReauth('Confirm raising your limits'))) {
        Alert.alert('Not changed', 'Raising a limit needs your biometrics or device passcode.');
        return;
      }
      setLimits(perTx, daily);
      setAcceptLimit(a);
      Alert.alert('Saved', 'Your limits are updated.');
      router.back();
    } catch (e) {
      Alert.alert('Invalid limits', e instanceof Error ? e.message : 'Check the numbers.');
    }
  }

  const field = (label: string, value: string, set: (v: string) => void, hint: string) => (
    <View>
      <Text style={s.label}>{label}</Text>
      <TextInput style={s.input} value={value} onChangeText={set} keyboardType="decimal-pad" placeholderTextColor={COLORS.textDim} />
      <Text style={s.hint}>{hint}</Text>
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        {field('Per-payment limit (USDC)', perTx, setPerTx, 'The most one payment may be, courier fee included. Checked on the phone before anything is signed.')}
        {field('Daily limit (USDC)', daily, setDaily, 'The most you can sign in a rolling 24 hours, including autopilot payments and cash outs.')}
        {field('Accept limit per payer (USD)', accept, setAccept, 'The most unsettled offline value you will hold from any one payer. Until a payment settles it is a promise: the payer could sign conflicting payments, and the first to settle wins. Default 100.')}
        <TouchableOpacity style={s.btn} onPress={save} activeOpacity={0.85}><Text style={s.btnText}>Save</Text></TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  pad: { padding: SPACING.lg, gap: SPACING.md },
  label: { color: COLORS.textMuted, fontSize: 12, marginBottom: 6 },
  input: { backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12, color: COLORS.text, fontSize: 16 },
  hint: { color: COLORS.textDim, fontSize: 12, lineHeight: 18, marginTop: 6 },
  btn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingVertical: 15, alignItems: 'center', marginTop: SPACING.md },
  btnText: { color: COLORS.bg, fontWeight: '700', fontSize: 16 },
});
