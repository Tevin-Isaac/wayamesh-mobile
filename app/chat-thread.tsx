import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '@/hooks/useWallet';
import { sendPayment as pay, planPayment } from '@/wallet/pay';
import { Avatar } from '@/components/pro';
import { getMessages, addMessage, getContact, acceptRequest, type ChatMessage, type Contact } from '@/db/chat';
import {
  acceptChatPayment, onChatChange, paymentView, purgeNow, sendPaymentMessage, sendText as sendChatText, trySendNearby, useRelayStatus,
} from '@/chat/service';
import { COLORS, SPACING, RADIUS, FONTS } from '@/constants/theme';

export default function ChatThreadScreen() {
  const params = useLocalSearchParams<{ peer: string; name?: string }>();
  const peer = (params.peer ?? '').toLowerCase();
  const [contact, setContact] = useState<Contact | null>(() => getContact(peer));
  const name = contact?.name ?? params.name ?? `${peer.slice(0, 6)}…${peer.slice(-4)}`;

  const { address, balance, unlock } = useWallet();
  const relay = useRelayStatus();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [payMode, setPayMode] = useState(false);
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const refresh = useCallback(() => { setMessages(getMessages(peer)); setContact(getContact(peer)); }, [peer]);
  useEffect(() => {
    purgeNow(); // thread opened: drop anything older than 24h first
    refresh();
    const off = onChatChange(refresh);
    // Payment bubbles read live settlement state from the transactions table; re-read it periodically.
    const t = setInterval(refresh, 5000);
    return () => { off(); clearInterval(t); };
  }, [refresh]);
  useEffect(() => { scrollRef.current?.scrollToEnd({ animated: true }); }, [messages.length]);

  async function sendText() {
    const body = text.trim();
    if (!body || !contact) return;
    setText('');
    try {
      await sendChatText(contact, body);
    } catch (e) {
      setText(body);
      Alert.alert('Not sent', e instanceof Error ? e.message : 'Could not send');
    }
    refresh();
  }

  async function sendPayment() {
    const amt = parseFloat(amount || '0');
    const bal = balance ? Number(balance) : 0;
    const plan = planPayment(address, amount);
    const available = plan.mode === 'voucher' ? Number(plan.reserve ?? 0) - Number(plan.fee) : bal - 0.0001;
    if (!(amt > 0) || amt > available) return;
    setSending(true);
    try {
      const wallet = await unlock();
      if (!wallet) { setSending(false); return; }
      const res = await pay(wallet, peer, amount);
      try {
        if (!contact) throw new Error('Unknown contact');
        // The thread message carries the payment code (mp2: voucher / signed transfer) so they can Accept it here.
        await sendPaymentMessage(contact, res.hash, amount);
      } catch (e) {
        // Payment is signed and stored; fall back to a local bubble and tell the user how to hand it over.
        addMessage({ peer, direction: 'out', kind: 'payment', amount, txHash: res.hash, status: 'pending' });
        Alert.alert('Payment signed', (contact?.pubkey ? (e instanceof Error ? e.message : 'Chat send failed') : 'This contact has no chat key yet') + '.\n\nTap the payment to share its code by QR or text.');
      }
      setAmount(''); setPayMode(false);
      refresh();
    } catch {
      // keep composer open on failure
    } finally {
      setSending(false);
    }
  }

  const noKey = !contact?.pubkey;
  const offline = relay.connected === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Avatar seed={name} size={34} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName}>{name}</Text>
          <Text style={styles.headerAddr}>{`${peer.slice(0, 8)}…${peer.slice(-6)}`}</Text>
          <Text style={styles.headerNote}>Messages disappear after 24 hours</Text>
        </View>
      </View>

      {contact?.request ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>New contact. They sent you a signed card. Accept to add them.</Text>
          <TouchableOpacity onPress={() => { acceptRequest(peer); refresh(); }}><Text style={styles.bannerAction}>Accept</Text></TouchableOpacity>
        </View>
      ) : null}
      {noKey ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Add their card to chat. You can already send them USDC.</Text>
          <TouchableOpacity onPress={() => router.push('/add-contact')}><Text style={styles.bannerAction}>Add their card</Text></TouchableOpacity>
        </View>
      ) : offline ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>No internet. Messages wait here and are sent when you reconnect. Bluetooth to a nearby phone is experimental and untested on devices.</Text>
          <TouchableOpacity onPress={async () => { const n = await trySendNearby(); Alert.alert('Bluetooth (experimental)', n > 0 ? `Handed ${n} message(s) to a nearby phone.` : 'No nearby Wayamesh phone in receive mode was found.'); refresh(); }}>
            <Text style={styles.bannerAction}>Try nearby</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.thread} keyboardShouldPersistTaps="handled">
          {messages.length === 0 && (
            <Text style={styles.hint}>Say hi. You can send USDC right in the chat.</Text>
          )}
          {messages.map((m) => <Bubble key={m.id} m={m} onChanged={refresh} />)}
        </ScrollView>

        {/* pay bar */}
        {payMode && (
          <View style={styles.payBar}>
            <Text style={styles.paySymbol}>$</Text>
            <TextInput
              style={styles.payInput} value={amount} onChangeText={setAmount}
              placeholder="0.00" placeholderTextColor={COLORS.textDim} keyboardType="decimal-pad" autoFocus
            />
            <Text style={styles.payAvail}>{balance ? Number(balance).toFixed(2) : '0.00'} avail</Text>
            <TouchableOpacity style={styles.paySend} onPress={sendPayment} disabled={sending} activeOpacity={0.85}>
              {sending ? <ActivityIndicator color={COLORS.bg} size="small" /> : <Text style={styles.paySendText}>Send USDC</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* composer */}
        <View style={styles.composer}>
          <TouchableOpacity onPress={() => setPayMode((p) => !p)} activeOpacity={0.7} style={[styles.payToggle, payMode && styles.payToggleOn]}>
            <Ionicons name="cash-outline" size={22} color={payMode ? COLORS.bg : COLORS.accent} />
          </TouchableOpacity>
          <TextInput
            style={styles.textInput} value={text} onChangeText={setText}
            placeholder="Message" placeholderTextColor={COLORS.textDim} multiline maxLength={1000} editable={!noKey}
          />
          <TouchableOpacity onPress={sendText} activeOpacity={0.8} style={styles.sendBtn} disabled={!text.trim() || noKey}>
            <Ionicons name="arrow-up" size={20} color={COLORS.bg} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const STATUS_LABEL: Record<string, string> = {
  queued: 'Waiting to send',
  handed: 'Handed to a nearby phone (experimental)',
  sent: 'Sent to relays',
  delivered: 'Delivered',
};

function Bubble({ m, onChanged }: { m: ChatMessage; onChanged: () => void }) {
  const out = m.direction === 'out';
  if (m.kind === 'payment') {
    const v = paymentView(m);
    function accept() {
      try {
        const res = acceptChatPayment(m);
        Alert.alert(res.status === 'duplicate' ? 'Already accepted' : 'Payment accepted', 'It settles on Arc when this phone is online.');
      } catch (e) {
        Alert.alert('Cannot accept', e instanceof Error ? e.message : 'Invalid payment');
      }
      onChanged();
    }
    return (
      <View style={[styles.payMsg, out ? styles.msgOut : styles.msgIn]}>
        <View style={styles.payMsgIcon}><Ionicons name="cash" size={16} color={COLORS.accent} /></View>
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.payMsgAmount}>{out ? 'You sent' : 'Payment of'} {m.amount} USDC</Text>
          {v.state === 'pending-accept' ? (
            <TouchableOpacity style={styles.acceptBtn} onPress={accept} activeOpacity={0.85}>
              <Text style={styles.acceptText}>Accept</Text>
            </TouchableOpacity>
          ) : v.state === 'invalid' ? (
            <Text style={[styles.payMsgStatus, { color: COLORS.error }]}>Not a valid payment for you</Text>
          ) : (
            <Text style={styles.payMsgStatus}>{v.label}</Text>
          )}
          {out && m.status && STATUS_LABEL[m.status] ? <Text style={styles.meta}>{STATUS_LABEL[m.status]}</Text> : null}
          {out && m.tx_hash ? (
            <TouchableOpacity onPress={() => router.push({ pathname: '/payment-qr', params: { hash: m.tx_hash as string } })}>
              <Text style={styles.metaLink}>Share code another way</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.bubble, out ? styles.bubbleOut : styles.bubbleIn]}>
      <Text style={[styles.bubbleText, out && styles.bubbleTextOut]}>{m.body}</Text>
      {out && m.status && STATUS_LABEL[m.status] ? <Text style={[styles.meta, styles.metaOut]}>{STATUS_LABEL[m.status]}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  headerNote: { fontSize: 10, color: COLORS.textDim, marginTop: 1 },
  headerAddr: { fontSize: 11, color: COLORS.textDim, fontFamily: FONTS.mono },

  thread: { padding: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  hint: { textAlign: 'center', color: COLORS.textDim, fontSize: 13, marginTop: SPACING.xl },

  bubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleOut: { alignSelf: 'flex-end', backgroundColor: COLORS.accent, borderBottomRightRadius: 4 },
  bubbleIn: { alignSelf: 'flex-start', backgroundColor: COLORS.surfaceAlt, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, color: COLORS.text, lineHeight: 20 },
  bubbleTextOut: { color: COLORS.bg },

  payMsg: {
    flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '80%',
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16,
    backgroundColor: COLORS.accentSoft, borderWidth: 1, borderColor: 'rgba(62,217,184,0.3)',
  },
  msgOut: { alignSelf: 'flex-end' },
  msgIn: { alignSelf: 'flex-start' },
  payMsgIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  payMsgAmount: { fontSize: 15, fontWeight: '700', color: COLORS.text, fontFamily: FONTS.mono },
  payMsgStatus: { fontSize: 11, color: COLORS.accent, marginTop: 2 },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: SPACING.sm, paddingHorizontal: SPACING.md, backgroundColor: COLORS.warningSoft },
  bannerText: { flex: 1, fontSize: 12, color: COLORS.textMuted, lineHeight: 17 },
  bannerAction: { color: COLORS.accent, fontWeight: '700', fontSize: 13 },
  acceptBtn: { marginTop: 6, backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingVertical: 8, paddingHorizontal: 18, alignSelf: 'flex-start' },
  acceptText: { color: COLORS.bg, fontWeight: '700' },
  meta: { fontSize: 10, color: COLORS.textDim, marginTop: 4 },
  metaOut: { color: 'rgba(7,7,15,0.6)', textAlign: 'right' },
  metaLink: { fontSize: 11, color: COLORS.accent, marginTop: 4 },

  payBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  paySymbol: { fontFamily: FONTS.mono, fontSize: 22, color: COLORS.textMuted },
  payInput: { flex: 1, fontFamily: FONTS.mono, fontSize: 22, color: COLORS.text, paddingVertical: 6 },
  payAvail: { fontSize: 11, color: COLORS.textDim },
  paySend: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingHorizontal: 16, paddingVertical: 12, minWidth: 108, alignItems: 'center' },
  paySendText: { color: COLORS.bg, fontWeight: '700', fontSize: 14 },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  payToggle: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  payToggleOn: { backgroundColor: COLORS.accent },
  textInput: {
    flex: 1, maxHeight: 120, minHeight: 42, backgroundColor: COLORS.surfaceAlt, borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md, paddingTop: 10, paddingBottom: 10, color: COLORS.text, fontSize: 15,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
});
