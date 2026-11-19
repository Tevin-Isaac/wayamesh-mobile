import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Avatar } from '@/components/pro';
import { acceptRequest, blockContact, getRequests, type Contact } from '@/db/chat';
import { onChatChange } from '@/chat/service';
import { COLORS, SPACING, RADIUS, FONTS } from '@/constants/theme';

// Message requests: people you have not added who sent you something. Nothing from them is trusted until you accept.
// The full address is shown so a look-alike name cannot fool you.

export default function RequestsScreen() {
  const [items, setItems] = useState<Contact[]>([]);
  const refresh = useCallback(() => { try { setItems(getRequests()); } catch { /* db not ready */ } }, []);
  useFocusEffect(useCallback(() => { refresh(); return onChatChange(refresh); }, [refresh]));

  function accept(c: Contact) {
    try { acceptRequest(c.address); refresh(); router.push({ pathname: '/chat-thread', params: { peer: c.address } }); }
    catch (e) { Alert.alert('Cannot accept', e instanceof Error ? e.message : 'Try again'); }
  }
  function block(c: Contact) {
    Alert.alert('Block this sender?', 'Their messages are deleted and anything new from them is ignored.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => { blockContact(c.address); refresh(); } },
    ]);
  }

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.pad}>
        <Text style={s.sub}>These people messaged you but are not in your contacts. Up to 40 requests are kept.</Text>
        {items.length === 0 ? <Text style={s.empty}>No message requests.</Text> : items.map((c) => (
          <View key={c.address} style={s.card}>
            <Avatar seed={c.address} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={s.addr}>{c.address}</Text>
              <View style={s.actions}>
                <TouchableOpacity style={s.accept} onPress={() => accept(c)} activeOpacity={0.85}><Text style={s.acceptText}>Accept</Text></TouchableOpacity>
                <TouchableOpacity style={s.block} onPress={() => block(c)} activeOpacity={0.85}><Text style={s.blockText}>Block</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  pad: { padding: SPACING.lg, gap: SPACING.md },
  sub: { color: COLORS.textMuted, fontSize: 13, lineHeight: 19 },
  empty: { color: COLORS.textDim, textAlign: 'center', marginTop: SPACING.xl },
  card: { flexDirection: 'row', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, padding: SPACING.md },
  addr: { fontFamily: FONTS.mono, fontSize: 11, color: COLORS.text },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  accept: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingVertical: 8, paddingHorizontal: 18 },
  acceptText: { color: COLORS.bg, fontWeight: '700' },
  block: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingVertical: 8, paddingHorizontal: 18 },
  blockText: { color: COLORS.error, fontWeight: '600' },
});
