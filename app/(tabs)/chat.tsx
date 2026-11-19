import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/pro';
import { getConversations, countRequests, type Conversation } from '@/db/chat';
import { onChatChange, pool, startChat, useRelayStatus } from '@/chat/service';
import { unlockChat, useChatUnlocked } from '@/chat/identity';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import { fmtDecimal } from '@/utils/safety';

export default function ChatScreen() {
  const [convos, setConvos] = useState<Conversation[]>([]);
  const relay = useRelayStatus();
  const unlocked = useChatUnlocked();
  const [requests, setRequests] = useState(0);

  const refresh = useCallback(() => {
    try { setConvos(getConversations()); setRequests(countRequests()); } catch { /* db not ready */ }
  }, []);
  // Opening Chats runs ONE biometric auth per app session (the wallet key is the chat key; it stays in memory while foregrounded).
  const unlock = useCallback(async () => {
    if (await unlockChat()) { if (!pool.active) void startChat(); }
  }, []);
  useFocusEffect(useCallback(() => {
    refresh();
    void unlock();
    return onChatChange(refresh);
  }, [refresh, unlock]));

  function preview(c: Conversation): string {
    if (!c.lastKind) return c.pubkey ? 'Tap to start chatting' : 'Add their card to chat';
    if (c.lastKind === 'payment') return `${c.lastDir === 'out' ? 'You sent' : 'Payment'} ${fmtDecimal(c.lastAmount) || ''} USDC`;
    if (c.lastKind === 'request') return `${c.lastDir === 'out' ? 'You requested' : 'Requests'} ${fmtDecimal(c.lastAmount) || ''} USDC`;
    return (c.lastDir === 'out' ? 'You: ' : '') + (c.lastBody ?? '');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.heading}>Chats</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={styles.ghostBtn} onPress={() => router.push('/my-card')} activeOpacity={0.8}>
            <Ionicons name="qr-code-outline" size={20} color={COLORS.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.newBtn} onPress={() => router.push('/add-contact')} activeOpacity={0.8}>
            <Ionicons name="person-add-outline" size={20} color={COLORS.bg} />
          </TouchableOpacity>
        </View>
      </View>
      {!unlocked ? (
        <TouchableOpacity style={styles.lockBanner} onPress={() => { void unlock(); }} activeOpacity={0.8}>
          <Ionicons name="lock-closed-outline" size={16} color={COLORS.accent} />
          <Text style={styles.lockText}>Chat is locked. Tap to unlock with biometrics (once per session).</Text>
        </TouchableOpacity>
      ) : null}
      {requests > 0 ? (
        <TouchableOpacity style={styles.lockBanner} onPress={() => router.push('/requests')} activeOpacity={0.8}>
          <Ionicons name="mail-unread-outline" size={16} color={COLORS.accent} />
          <Text style={styles.lockText}>{requests} message request{requests === 1 ? '' : 's'} from people you have not added.</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={styles.net}>
        {relay.connected > 0
          ? `Online. Messages are end-to-end encrypted (${relay.connected} of ${relay.total} relays connected).`
          : 'Not connected. Messages will be sent when you are back online.'}
      </Text>

      <ScrollView contentContainerStyle={styles.scroll}>
        {convos.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={40} color={COLORS.textDim} />
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptyHint}>Add a contact by scanning their card, or show them yours. A web wallet user can message you too. Then chat and send USDC in the same place.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/add-contact')} activeOpacity={0.85}>
              <Text style={styles.emptyBtnText}>Add contact</Text>
            </TouchableOpacity>
          </View>
        ) : (
          convos.map((c) => (
            <TouchableOpacity
              key={c.address}
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => router.push({ pathname: '/chat-thread', params: { peer: c.address, name: c.name } })}
            >
              <Avatar seed={c.name || c.address} size={48} />
              <View style={styles.rowBody}>
                <Text style={styles.rowName}>{c.name || `${c.address.slice(0, 6)}…${c.address.slice(-4)}`}</Text>
                <Text style={styles.rowPreview} numberOfLines={1}>{preview(c)}</Text>
              </View>
              {c.lastAt ? <Text style={styles.rowTime}>{new Date(c.lastAt * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text> : null}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  heading: { fontSize: 28, fontWeight: '700', color: COLORS.text, letterSpacing: -0.3 },
  ghostBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  lockBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: SPACING.lg, marginTop: SPACING.sm, padding: SPACING.sm, borderRadius: RADIUS.md, backgroundColor: COLORS.accentSoft },
  lockText: { flex: 1, fontSize: 12, color: COLORS.textMuted },
  net: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, fontSize: 12, color: COLORS.textDim },
  newBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: SPACING.lg, paddingTop: SPACING.md },

  empty: { alignItems: 'center', paddingTop: SPACING.xxl, gap: SPACING.sm },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.textMuted, marginTop: SPACING.sm },
  emptyHint: { fontSize: 13, color: COLORS.textDim, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
  emptyBtn: { marginTop: SPACING.md, backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingVertical: 12, paddingHorizontal: 28 },
  emptyBtnText: { color: COLORS.bg, fontWeight: '700', fontSize: 15 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  rowPreview: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  rowTime: { fontSize: 11, color: COLORS.textDim },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: SPACING.lg },
  modalCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.sm },
  input: { backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12, color: COLORS.text, fontSize: 15, marginBottom: SPACING.sm },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  scanBtn: { width: 46, height: 46, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  modalActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  cancelBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  cancelText: { color: COLORS.textMuted, fontWeight: '600' },
  saveBtn: { flex: 2, paddingVertical: 14, alignItems: 'center', borderRadius: RADIUS.md, backgroundColor: COLORS.accent },
  saveText: { color: COLORS.bg, fontWeight: '700' },
});
