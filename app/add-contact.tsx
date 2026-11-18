import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView, Vibration } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import { Avatar } from '@/components/pro';
import { decodeCard, isCard, safetyNumber, type ContactCard } from '@/chat/crypto';
import { getChatKey } from '@/chat/identity';
import { chatPubkeyOf } from '@/chat/crypto';
import { addContact, getContact, upsertChatContact } from '@/db/chat';
import { COLORS, SPACING, RADIUS, FONTS } from '@/constants/theme';

// Add a contact by scanning their card QR or pasting the card text. The card is verified on import:
// the wallet address must have signed exactly this chat key, so a card cannot be forged or edited.
// (Uses expo-camera directly; app/scan.tsx is untouched.)

export default function AddContactScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const asked = useRef(false);
  const [card, setCard] = useState<ContactCard | null>(null);
  const [name, setName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [safety, setSafety] = useState('');
  const locked = useRef(false);
  const [aName, setAName] = useState('');
  const [aAddr, setAAddr] = useState('');
  const [aPhone, setAPhone] = useState('');

  // Save by address only: no chat key needed, payments work. Chat starts once their card is added.
  function saveByAddress() {
    const a = aAddr.trim();
    if (!ethers.isAddress(a)) { Alert.alert('Invalid address', 'Enter a valid 0x wallet address'); return; }
    if (!aName.trim()) { Alert.alert('Name required', 'Give this contact a name'); return; }
    addContact(ethers.getAddress(a), aName, aPhone);
    router.replace({ pathname: '/chat-thread', params: { peer: a.toLowerCase(), name: aName.trim() } });
  }

  useEffect(() => {
    if (!permission?.granted && !asked.current) { asked.current = true; requestPermission(); }
  }, [permission]);

  async function accept(text: string) {
    if (locked.current) return;
    if (!isCard(text)) { Alert.alert('Not a contact card', 'Scan or paste a card that starts with mpc1:'); return; }
    try {
      const c = decodeCard(text);
      locked.current = true;
      Vibration.vibrate(60);
      const mine = await getChatKey();
      setSafety(mine ? safetyNumber(chatPubkeyOf(mine), c.pubkey) : '');
      setCard({ ...c, address: ethers.getAddress(c.address) });
      setName(getContact(c.address)?.name ?? c.name);
    } catch (e) {
      Alert.alert('Card rejected', e instanceof Error ? e.message : 'Invalid card');
    }
  }

  function save() {
    if (!card) return;
    upsertChatContact({ address: card.address, name: name.trim() || `${card.address.slice(0, 6)}…${card.address.slice(-4)}`, pubkey: card.pubkey, request: false });
    router.replace({ pathname: '/chat-thread', params: { peer: card.address.toLowerCase() } });
  }

  if (card) {
    return (
      <SafeAreaView style={s.container}>
        <ScrollView contentContainerStyle={s.pad}>
          <View style={s.center}>
            <Avatar seed={name || card.address} size={72} />
            <Text style={s.addr}>{card.address}</Text>
          </View>
          <Text style={s.label}>Name</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Contact name" placeholderTextColor={COLORS.textDim} />
          <View style={s.note}>
            <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.accent} />
            <Text style={s.noteText}>
              This card is signed by the wallet above, so the chat key really belongs to it.
              {safety ? ' To be sure nobody swapped the card, compare this number with theirs:' : ''}
            </Text>
          </View>
          {safety ? <Text style={s.safety}>{safety}</Text> : null}
          <TouchableOpacity style={s.primary} onPress={save} activeOpacity={0.85}>
            <Text style={s.primaryText}>Add contact</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.secondary} onPress={() => { locked.current = false; setCard(null); }} activeOpacity={0.7}>
            <Text style={s.secondaryText}>Scan a different card</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Add contact</Text>
        <Text style={s.sub}>Scan their card QR, or paste the card text they sent you.</Text>
        <View style={s.camera}>
          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => { void accept(data); }}
            />
          ) : (
            <View style={s.center}>
              <Ionicons name="camera-outline" size={40} color={COLORS.textMuted} />
              <TouchableOpacity onPress={requestPermission}><Text style={s.link}>Allow camera</Text></TouchableOpacity>
            </View>
          )}
        </View>
        <Text style={s.label}>Or paste a card</Text>
        <TextInput
          style={[s.input, { minHeight: 70 }]} value={pasteText} onChangeText={setPasteText} multiline
          placeholder="mpc1:…" placeholderTextColor={COLORS.textDim} autoCapitalize="none" autoCorrect={false}
        />
        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
          <TouchableOpacity style={[s.secondary, { flex: 1 }]} onPress={async () => { const t = await Clipboard.getStringAsync(); setPasteText(t); if (t.trim()) void accept(t); }} activeOpacity={0.7}>
            <Text style={s.secondaryText}>Paste from clipboard</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.primary, { flex: 1, marginTop: 0 }]} onPress={() => { void accept(pasteText); }} activeOpacity={0.85} disabled={!pasteText.trim()}>
            <Text style={s.primaryText}>Add</Text>
          </TouchableOpacity>
        </View>
        <Text style={[s.label, { marginTop: SPACING.lg }]}>Or save by wallet address (no chat yet)</Text>
        <TextInput style={s.input} value={aName} onChangeText={setAName} placeholder="Name" placeholderTextColor={COLORS.textDim} />
        <TextInput style={s.input} value={aAddr} onChangeText={setAAddr} placeholder="Wallet address 0x…" placeholderTextColor={COLORS.textDim} autoCapitalize="none" autoCorrect={false} />
        <TextInput style={s.input} value={aPhone} onChangeText={setAPhone} placeholder="Phone number (optional note)" placeholderTextColor={COLORS.textDim} keyboardType="phone-pad" />
        <Text style={s.fine}>The phone number is only a label for you. It is never used to find people or sent anywhere.</Text>
        <TouchableOpacity style={s.secondary} onPress={saveByAddress} activeOpacity={0.8}>
          <Text style={s.secondaryText}>Save contact</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  pad: { padding: SPACING.lg, gap: SPACING.sm },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  sub: { color: COLORS.textMuted, fontSize: 13, marginBottom: SPACING.sm },
  camera: { height: 260, borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', gap: SPACING.sm, marginVertical: SPACING.md },
  label: { color: COLORS.textMuted, fontSize: 12, marginTop: SPACING.md },
  input: { backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12, color: COLORS.text, fontSize: 14 },
  addr: { fontFamily: FONTS.mono, fontSize: 11, color: COLORS.textMuted, textAlign: 'center' },
  note: { flexDirection: 'row', gap: 8, backgroundColor: COLORS.accentSoft, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.md },
  noteText: { flex: 1, color: COLORS.textMuted, fontSize: 12, lineHeight: 18 },
  safety: { fontFamily: FONTS.mono, color: COLORS.text, fontSize: 14, textAlign: 'center', marginVertical: SPACING.sm },
  primary: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center', marginTop: SPACING.md },
  primaryText: { color: COLORS.bg, fontWeight: '700', fontSize: 15 },
  secondary: { borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 14, alignItems: 'center', marginTop: SPACING.sm },
  secondaryText: { color: COLORS.textMuted, fontWeight: '600' },
  fine: { color: COLORS.textDim, fontSize: 11 },
  link: { color: COLORS.accent, fontWeight: '600' },
});
