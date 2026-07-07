import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '@/hooks/useWallet';
import { buildOfflineTransfer } from '@/wallet/transactions';
import { Avatar } from '@/components/pro';
import { getMessages, addMessage, getContact, type ChatMessage } from '@/db/chat';
import { COLORS, SPACING, RADIUS, FONTS } from '@/constants/theme';

export default function ChatThreadScreen() {
  const params = useLocalSearchParams<{ peer: string; name?: string }>();
  const peer = (params.peer ?? '').toLowerCase();
  const name = params.name ?? getContact(peer)?.name ?? `${peer.slice(0, 6)}…${peer.slice(-4)}`;

  const { balance, unlock } = useWallet();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [payMode, setPayMode] = useState(false);
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const refresh = useCallback(() => setMessages(getMessages(peer)), [peer]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { scrollRef.current?.scrollToEnd({ animated: true }); }, [messages]);

  function sendText() {
    const body = text.trim();
    if (!body) return;
    addMessage({ peer, direction: 'out', kind: 'text', body });
    setText('');
    refresh();
  }

  async function sendPayment() {
    const amt = parseFloat(amount || '0');
    const bal = balance ? Number(balance) : 0;
    if (!(amt > 0) || amt > bal - 0.0001) return;
    setSending(true);
    try {
      const wallet = await unlock();
      if (!wallet) { setSending(false); return; }
      const tx = await buildOfflineTransfer(wallet, peer, amount);
      addMessage({ peer, direction: 'out', kind: 'payment', amount, txHash: tx.hash, status: 'pending' });
      setAmount(''); setPayMode(false);
      refresh();
    } catch {
      // keep composer open on failure
    } finally {
      setSending(false);
    }
  }

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
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.thread} keyboardShouldPersistTaps="handled">
          {messages.length === 0 && (
            <Text style={styles.hint}>Say hi 👋 — and send USDC right in the chat.</Text>
          )}
          {messages.map((m) => <Bubble key={m.id} m={m} />)}
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
            placeholder="Message" placeholderTextColor={COLORS.textDim} multiline
          />
          <TouchableOpacity onPress={sendText} activeOpacity={0.8} style={styles.sendBtn} disabled={!text.trim()}>
            <Ionicons name="arrow-up" size={20} color={COLORS.bg} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ m }: { m: ChatMessage }) {
  const out = m.direction === 'out';
  if (m.kind === 'payment') {
    return (
      <View style={[styles.payMsg, out ? styles.msgOut : styles.msgIn]}>
        <View style={styles.payMsgIcon}><Ionicons name="cash" size={16} color={COLORS.accent} /></View>
        <View>
          <Text style={styles.payMsgAmount}>{out ? 'You sent' : 'Received'} {m.amount} USDC</Text>
          <Text style={styles.payMsgStatus}>{(m.status ?? 'pending')} · signed offline</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.bubble, out ? styles.bubbleOut : styles.bubbleIn]}>
      <Text style={[styles.bubbleText, out && styles.bubbleTextOut]}>{m.body}</Text>
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
