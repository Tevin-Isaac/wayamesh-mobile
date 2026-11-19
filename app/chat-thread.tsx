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
import { getMessages, addMessage, getContact, acceptRequest, blockContact, clearConversation, setVerified, getInvoice, type ChatMessage, type Contact } from '@/db/chat';
import {
  onChatChange, paymentView, purgeNow, sendPaymentMessage, sendRequest, sendText as sendChatText, trySendNearby, useRelayStatus,
} from '@/chat/service';
import { getSession, unlockChat } from '@/chat/identity';
import { safetyNumber, type Hex } from '@/chat/crypto';
import { fmtDecimal, safeDecimal } from '@/utils/safety';
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
  const [requestMode, setRequestMode] = useState(false);
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
    const plan = planPayment(address, amount);
    const available = Number(plan.reserve ?? 0) - Number(plan.fee);
    if (!(amt > 0)) return;
    if (plan.mode !== 'voucher' || amt > available) {
      Alert.alert('Not enough in your offline reserve', 'Chat payments are sent from your offline reserve so they can travel with the message. Add funds to the reserve first, or use Send.');
      return;
    }
    setSending(true);
    try {
      if (!contact?.pubkey) throw new Error('This contact has no chat key yet. Add their card first.');
      if (!(await unlockChat())) throw new Error('Chat is locked. Authenticate to unlock it.');
      const wallet = await unlock();
      if (!wallet) { setSending(false); return; }
      const res = await pay(wallet, peer, amount, { voucherOnly: true });
      try {
        // The thread message carries the payment code (mp2: voucher); the receiver ingests it automatically.
        await sendPaymentMessage(contact, res.hash, amount);
      } catch (e) {
        // Payment is signed and stored; fall back to a local bubble and tell the user how to hand it over.
        addMessage({ peer, direction: 'out', kind: 'payment', amount, txHash: res.hash, status: 'pending', verified: true });
        Alert.alert('Payment signed', (e instanceof Error ? e.message : 'Chat send failed') + '.\n\nTap the payment to share its code by QR or text.');
      }
      setAmount(''); setPayMode(false);
      refresh();
    } catch (e) {
      Alert.alert('Not sent', e instanceof Error ? e.message : 'Could not send');
    } finally {
      setSending(false);
    }
  }

  async function sendRequestMsg() {
    if (!contact || !safeDecimal(amount) || !(Number(amount) > 0)) { Alert.alert('Enter an amount', 'Type the amount you are asking for.'); return; }
    setSending(true);
    try {
      await sendRequest(contact, amount);
      setAmount(''); setPayMode(false); setRequestMode(false);
      refresh();
    } catch (e) {
      Alert.alert('Not sent', e instanceof Error ? e.message : 'Could not send');
    } finally {
      setSending(false);
    }
  }

  function showSafety() {
    const mine = getSession()?.pubkey;
    if (!mine || !contact?.pubkey) { Alert.alert('Unlock chat first', 'Open Chats and unlock with biometrics to see the safety number.'); return; }
    const n = safetyNumber(mine as Hex, contact.pubkey as Hex);
    Alert.alert(
      contact.verified ? 'Verified' : 'Safety number',
      `Compare this number with ${name} in person or on a call. If it matches, nobody is in the middle.\n\n${n}`,
      [
        { text: 'Close', style: 'cancel' },
        { text: contact.verified ? 'Mark not verified' : 'It matches', onPress: () => { setVerified(peer, !contact.verified); refresh(); } },
      ],
    );
  }

  function conversationMenu() {
    Alert.alert(name, undefined, [
      { text: 'Safety number', onPress: showSafety },
      { text: 'Clear conversation', onPress: () => { clearConversation(peer); refresh(); } },
      { text: 'Block', style: 'destructive', onPress: () => { blockContact(peer); router.back(); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
          <Text style={styles.headerNote}>Messages disappear after 24 hours{contact?.verified ? '  ·  Verified' : ''}</Text>
        </View>
        <TouchableOpacity onPress={conversationMenu} activeOpacity={0.7}><Ionicons name="ellipsis-horizontal" size={22} color={COLORS.textMuted} /></TouchableOpacity>
      </View>

      {contact?.request ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Message request from an address you have not added. Accept to add them, or block.</Text>
          <TouchableOpacity onPress={() => { try { acceptRequest(peer); } catch (e) { Alert.alert('Cannot accept', e instanceof Error ? e.message : 'Try again'); } refresh(); }}><Text style={styles.bannerAction}>Accept</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => { blockContact(peer); router.back(); }}><Text style={[styles.bannerAction, { color: COLORS.error }]}>Block</Text></TouchableOpacity>
        </View>
      ) : null}
      {noKey ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Add their card to chat. You can already send them USDC.</Text>
          <TouchableOpacity onPress={() => router.push('/add-contact')}><Text style={styles.bannerAction}>Add their card</Text></TouchableOpacity>
        </View>
      ) : offline ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>No internet. Messages wait here and are sent when you reconnect. Bluetooth hand-off is Android only, experimental and untested on devices; on iPhone use QR or text.</Text>
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
          {messages.map((m) => <Bubble key={m.id} m={m} peer={peer} onChanged={refresh} />)}
        </ScrollView>

        {/* pay bar */}
        {payMode && (
          <View style={styles.payBar}>
            <TouchableOpacity onPress={() => setRequestMode((r) => !r)} activeOpacity={0.7}><Text style={styles.modeToggle}>{requestMode ? 'Request' : 'Pay'}</Text></TouchableOpacity>
            <Text style={styles.paySymbol}>$</Text>
            <TextInput
              style={styles.payInput} value={amount} onChangeText={setAmount}
              placeholder="0.00" placeholderTextColor={COLORS.textDim} keyboardType="decimal-pad" autoFocus
            />
            {!requestMode ? <Text style={styles.payAvail}>{balance ? Number(balance).toFixed(2) : '0.00'} avail</Text> : null}
            <TouchableOpacity style={styles.paySend} onPress={requestMode ? sendRequestMsg : sendPayment} disabled={sending} activeOpacity={0.85}>
              {sending ? <ActivityIndicator color={COLORS.bg} size="small" /> : <Text style={styles.paySendText}>{requestMode ? 'Request' : 'Send USDC'}</Text>}
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
            placeholder="Message" placeholderTextColor={COLORS.textDim} multiline maxLength={500} editable={!noKey}
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
  pending: 'Signed',
  sent: 'Sent to relays',
  delivered: 'Delivered',
};

function Bubble({ m, peer, onChanged }: { m: ChatMessage; peer: string; onChanged: () => void }) {
  const out = m.direction === 'out';
  if (m.kind === 'request') {
    const amt = fmtDecimal(m.amount); // a stranger's amount, shown only if it is a plain decimal
    const inv = out && m.ref ? getInvoice(m.ref) : null;
    return (
      <View style={[styles.payMsg, out ? styles.msgOut : styles.msgIn]}>
        <View style={styles.payMsgIcon}><Ionicons name="receipt-outline" size={16} color={COLORS.accent} /></View>
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.payMsgAmount}>{out ? 'You requested' : 'Requests'} {amt || '?'} USDC</Text>
          {m.body ? <Text style={styles.payMsgStatus}>{m.body}</Text> : null}
          {out ? (
            <Text style={styles.payMsgStatus}>{inv?.status === 'received' ? 'Paid' : 'Waiting for payment'}</Text>
          ) : amt ? (
            <TouchableOpacity
              style={styles.acceptBtn} activeOpacity={0.85}
              onPress={() => router.push({ pathname: '/send', params: { scannedAddress: peer, amount: m.amount ?? '', ref: m.ref ?? '' } })}
            >
              <Text style={styles.acceptText}>Pay</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }
  if (m.kind === 'payment') {
    const v = paymentView(m);
    return (
      <View style={[styles.payMsg, out ? styles.msgOut : styles.msgIn]}>
        <View style={styles.payMsgIcon}><Ionicons name="cash" size={16} color={COLORS.accent} /></View>
        <View style={{ flexShrink: 1 }}>
          {v.state === 'invalid' ? (
            <Text style={[styles.payMsgStatus, { color: COLORS.error }]}>Not a valid payment: {v.reason}</Text>
          ) : (
            <>
              {/* The amount is the one inside the verified payment code, never a number the sender typed. */}
              <Text style={styles.payMsgAmount}>{out ? 'You sent' : 'Payment of'} {fmtDecimal(m.amount) || m.amount} USDC</Text>
              <Text style={[styles.payMsgStatus, v.state === 'carried' && { color: COLORS.warning }]}>{v.label}</Text>
            </>
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
  modeToggle: { color: COLORS.accent, fontWeight: '700', fontSize: 13, paddingRight: 4 },
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
