import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

// An honest statement of what is and is not protected. Mirrors the "What is still true" section of the
// SECURITY.md, adapted to the phone. This app is a TESTNET build and has not been independently audited.

const PROTECTED = [
  'Your wallet key is kept in the phone\'s secure storage and, with biometric unlock on, the OS asks for your fingerprint or face on every read. It is never uploaded.',
  'Chat is end-to-end encrypted. Relays only see ciphertext and cannot tell who wrote it. Chat uses your wallet key, which stays in memory only while the app is open and is wiped when it goes to the background.',
  'Spending limits, the accept limit and the autopilot mandate are enforced on the phone, and raising them needs a fresh biometric check.',
  'Payments are checked before they are accepted: signature, expiry, a recipient that is really you, and canonical signatures that can settle. The amount you see is read from the signed payment, never from what a sender typed.',
  'Money cannot be sent to the empty address, the USDC contract or the settlement contract. Stored data from strangers is capped so nobody can fill your phone.',
];

const NOT_PROTECTED = [
  'Offline payments are provisional until they settle. A payer can sign conflicting payments, including to another address they control, and the first to settle wins. Accept offline only what you would trust the payer with. The accept limit helps; it does not remove the risk.',
  'Relays are public infrastructure. They cannot read messages or see who sent them, but they see your network address and the key you receive on. They can be slow, drop messages or block you.',
  'Messages disappear after 24 hours on this phone, but a person you chatted with can copy or screenshot anything. Deletion on their device is not in our control.',
  'If someone has your unlocked phone and your biometrics or passcode, they can spend within your limits.',
  'Bluetooth hand-off is Android only, experimental and has not been tested on devices. iPhone uses QR or text.',
  'This is a testnet app. It has not been independently audited and must not hold real money. There is no bug bounty yet.',
];

export default function SecurityScreen() {
  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.pad}>
        <Text style={s.h}>What is protected</Text>
        {PROTECTED.map((t) => <Text key={t} style={s.item}>{'•  '}{t}</Text>)}
        <Text style={[s.h, { marginTop: SPACING.lg }]}>What is still true</Text>
        <View style={s.warn}>{NOT_PROTECTED.map((t) => <Text key={t} style={s.item}>{'•  '}{t}</Text>)}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  pad: { padding: SPACING.lg, gap: SPACING.sm },
  h: { color: COLORS.text, fontSize: 18, fontWeight: '700', marginBottom: SPACING.xs },
  item: { color: COLORS.textMuted, fontSize: 14, lineHeight: 21, marginBottom: SPACING.sm },
  warn: { backgroundColor: COLORS.warningSoft, borderRadius: RADIUS.md, padding: SPACING.md },
});
