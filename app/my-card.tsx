import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Share, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { myCardText, getMyName, setMyName, unlockChat } from '@/chat/identity';
import { cleanText } from '@/chat/crypto';
import { startChat } from '@/chat/service';
import { COLORS, SPACING, RADIUS, FONTS } from '@/constants/theme';

// "My card": the Arc Studio compatible `mpc1:` contact card others scan or paste to message you. Public data: wallet address,
// compressed public key and a display name. The same card format works in the web wallet and the phone app.

export default function MyCardScreen() {
  const [card, setCard] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(true);

  async function load() {
    // The card needs the wallet public key, which comes from the one-per-session unlock.
    await unlockChat();
    const c = myCardText();
    setCard(c);
    setName(getMyName());
    if (c) void startChat();
    setBusy(false);
  }
  useEffect(() => { void load(); }, []);

  function saveName() {
    setMyName(cleanText(name, 24));
    setCard(myCardText());
  }

  if (busy) return <SafeAreaView style={s.container}><ActivityIndicator color={COLORS.accent} style={{ marginTop: 80 }} /></SafeAreaView>;
  if (!card) {
    return (
      <SafeAreaView style={s.container}>
        <Text style={[s.sub, { padding: SPACING.lg }]}>Your card needs the wallet unlocked once (biometric). Go back and try again.</Text>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>My card</Text>
        <Text style={s.sub}>Let a friend scan this, or send them the text. They can then message you and send you USDC.</Text>
        <View style={s.qr}><QRCode value={card} size={230} backgroundColor="#FFFFFF" color="#07070F" ecl="L" /></View>
        <Text style={s.label}>Name shown to contacts</Text>
        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
          <TextInput style={[s.input, { flex: 1 }]} value={name} onChangeText={setName} maxLength={24} placeholder="Your name" placeholderTextColor={COLORS.textDim} />
          <TouchableOpacity style={s.saveBtn} onPress={saveName} activeOpacity={0.85}><Text style={s.saveText}>Save</Text></TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md }}>
          <TouchableOpacity style={[s.btn, { flex: 1 }]} onPress={() => Share.share({ message: card }).catch(() => undefined)} activeOpacity={0.8}>
            <Ionicons name="share-outline" size={18} color={COLORS.accent} /><Text style={s.btnText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, { flex: 1 }]} onPress={async () => { await Clipboard.setStringAsync(card); Alert.alert('Copied', 'Contact card copied.'); }} activeOpacity={0.8}>
            <Ionicons name="copy-outline" size={18} color={COLORS.accent} /><Text style={s.btnText}>Copy</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.fine}>{card.slice(0, 40)}…</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  pad: { padding: SPACING.lg, gap: SPACING.sm },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  sub: { color: COLORS.textMuted, fontSize: 13, lineHeight: 19 },
  qr: { alignSelf: 'center', backgroundColor: '#FFFFFF', padding: 14, borderRadius: RADIUS.lg, marginVertical: SPACING.md },
  label: { color: COLORS.textMuted, fontSize: 12, marginTop: SPACING.sm },
  input: { backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12, color: COLORS.text, fontSize: 15 },
  saveBtn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingHorizontal: 18, justifyContent: 'center' },
  saveText: { color: COLORS.bg, fontWeight: '700' },
  btn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingVertical: 14 },
  btnText: { color: COLORS.text, fontWeight: '600' },
  fine: { fontFamily: FONTS.mono, fontSize: 10, color: COLORS.textDim, textAlign: 'center', marginTop: SPACING.md },
});
