import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import { Avatar, Eyebrow } from '@/components/pro';
import { getConversations, addContact, type Conversation } from '@/db/chat';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

export default function ChatScreen() {
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [addr, setAddr] = useState('');

  const refresh = useCallback(() => setConvos(getConversations()), []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  function preview(c: Conversation): string {
    if (!c.lastKind) return 'Tap to start chatting';
    if (c.lastKind === 'payment') return `💸 ${c.lastAmount} USDC`;
    return c.lastBody ?? '';
  }

  function save() {
    const a = addr.trim();
    if (!ethers.isAddress(a)) { Alert.alert('Invalid address', 'Enter a valid 0x wallet address'); return; }
    if (!name.trim()) { Alert.alert('Name required', 'Give this contact a name'); return; }
    addContact(a, name.trim());
    setAdding(false); setName(''); setAddr('');
    refresh();
    router.push({ pathname: '/chat-thread', params: { peer: a.toLowerCase(), name: name.trim() } });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.heading}>Chats</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => setAdding(true)} activeOpacity={0.8}>
          <Ionicons name="create-outline" size={20} color={COLORS.bg} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {convos.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={40} color={COLORS.textDim} />
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptyHint}>Add a contact to chat and send USDC in the same place.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setAdding(true)} activeOpacity={0.85}>
              <Text style={styles.emptyBtnText}>New chat</Text>
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
                <Text style={styles.rowName}>{c.name}</Text>
                <Text style={styles.rowPreview} numberOfLines={1}>{preview(c)}</Text>
              </View>
              {c.lastAt ? <Text style={styles.rowTime}>{new Date(c.lastAt * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text> : null}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* new contact modal */}
      <Modal visible={adding} transparent animationType="fade" onRequestClose={() => setAdding(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Eyebrow>New chat</Eyebrow>
            <TextInput
              style={styles.input} value={name} onChangeText={setName}
              placeholder="Contact name" placeholderTextColor={COLORS.textDim}
            />
            <View style={styles.addrRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]} value={addr} onChangeText={setAddr}
                placeholder="Wallet address 0x…" placeholderTextColor={COLORS.textDim}
                autoCapitalize="none" autoCorrect={false}
              />
              <TouchableOpacity onPress={() => { setAdding(false); router.push('/scan'); }} activeOpacity={0.7} style={styles.scanBtn}>
                <Ionicons name="qr-code-outline" size={20} color={COLORS.accent} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setAdding(false)} activeOpacity={0.7} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={save} activeOpacity={0.85} style={styles.saveBtn}>
                <Text style={styles.saveText}>Start chat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  heading: { fontSize: 28, fontWeight: '700', color: COLORS.text, letterSpacing: -0.3 },
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
