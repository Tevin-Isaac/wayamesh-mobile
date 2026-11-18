import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ethers } from 'ethers';
import { useWallet } from '@/hooks/useWallet';
import { Eyebrow } from '@/components/pro';
import { getRampConfig, buildBuyUrl, FAUCET_URL } from '@/constants/ramp';
import { ACTIVE_CHAIN } from '@/constants/chain';
import { withRpc } from '@/wallet/rpc';
import {
  isRampConfigured, getConfig, startOnramp, startOfframp, pollOrder, normalizePhone,
  previewUsdcForKes, previewKesForUsdc, type RampServerConfig, type RampOrder,
} from '@/ramp/client';
import { COLORS, SPACING, RADIUS, FONTS } from '@/constants/theme';

// Add money / Cash out via M-Pesa through our ramp server (server/).
// On testnet this is a SANDBOX: testnet USDC at a fixed demo rate.

type Tab = 'add' | 'out';
const GAS_BUFFER = 0.05; // USDC kept back for gas (Arc gas is paid in USDC)

export default function RampScreen() {
  const { address, balance, unlock, refresh } = useWallet();
  const [tab, setTab] = useState<Tab>('add');
  const [cfg, setCfg] = useState<RampServerConfig | null>(null);
  const [cfgErr, setCfgErr] = useState<string | null>(null);
  const configured = isRampConfigured();

  useEffect(() => {
    if (!configured) return;
    getConfig().then(setCfg).catch((e) => setCfgErr(e.message));
  }, [configured]);

  const sandbox = !!cfg && (cfg.mock || cfg.network.includes('testnet'));

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.tabs}>
            {(['add', 'out'] as Tab[]).map((t) => (
              <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabOn]} onPress={() => setTab(t)}>
                <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{t === 'add' ? 'Add money' : 'Cash out'}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {!configured ? (
            <Banner text="Ramp server not configured. Set EXPO_PUBLIC_RAMP_API_URL to enable M-Pesa. You can still use the card / bank and faucet options below." />
          ) : cfgErr ? (
            <Banner text={`Can't reach the ramp server (${cfgErr}).`} />
          ) : !cfg ? (
            <ActivityIndicator color={COLORS.accent} style={{ marginVertical: SPACING.lg }} />
          ) : (
            <>
              {sandbox && (
                <Banner
                  text={`Testnet demo rate: 1 USDC = ${cfg.usdKes} KES. ${cfg.mock ? 'M-Pesa is simulated (no real money moves). ' : ''}USDC here is Arc testnet USDC with no real value.`}
                />
              )}
              {tab === 'add'
                ? <AddMoney cfg={cfg} address={address} unlock={unlock} onDone={refresh} />
                : <CashOut cfg={cfg} address={address} balance={balance} unlock={unlock} onDone={refresh} />}
            </>
          )}

          <SecondaryOptions address={address} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Banner({ text }: { text: string }) {
  return (
    <View style={styles.banner}>
      <Ionicons name="flask-outline" size={16} color={COLORS.warning} />
      <Text style={styles.bannerText}>{text}</Text>
    </View>
  );
}

type Unlock = () => Promise<ethers.Wallet | null>;

function AddMoney({ cfg, address, unlock, onDone }: { cfg: RampServerConfig; address: string | null; unlock: Unlock; onDone: () => void }) {
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [order, setOrder] = useState<RampOrder | null>(null);
  const cancel = useRef({ cancelled: false });
  useEffect(() => () => { cancel.current.cancelled = true; }, []);

  const kes = Math.floor(Number(amount));
  const validAmount = Number.isFinite(kes) && kes >= cfg.minKes && kes <= cfg.maxKes;
  const preview = validAmount ? previewUsdcForKes(cfg, kes) : 0;

  async function submit() {
    setErr(null);
    if (!normalizePhone(phone)) return setErr('Enter a valid Kenyan number, e.g. 0712 345 678');
    if (!validAmount) return setErr(`Amount must be between ${cfg.minKes} and ${cfg.maxKes} KES`);
    setBusy(true);
    try {
      const wallet = await unlock();
      if (!wallet) throw new Error('Wallet locked');
      const r = await startOnramp(wallet, phone, kes);
      setOrder({ id: r.id, kind: 'onramp', status: r.status, usdc: preview.toFixed(6), kes, phoneMasked: '', mock: r.mock });
      const final = await pollOrder(r.id, setOrder, { signal: cancel.current });
      if (final.status === 'completed') onDone();
    } catch (e: any) {
      setErr(e.message ?? 'Something went wrong');
    } finally { setBusy(false); }
  }

  if (order) return <Timeline order={order} onReset={() => { setOrder(null); setAmount(''); }} />;

  return (
    <View style={styles.form}>
      <Field label="M-Pesa number" value={phone} onChangeText={setPhone} placeholder="0712 345 678" keyboardType="phone-pad" prefix="+254" />
      <Field label="Amount (KES)" value={amount} onChangeText={setAmount} placeholder={`${cfg.minKes} – ${cfg.maxKes}`} keyboardType="number-pad" />
      <View style={styles.preview}>
        <Text style={styles.previewLabel}>You receive (approx.)</Text>
        <Text style={styles.previewValue}>{preview.toFixed(2)} USDC</Text>
      </View>
      <Text style={styles.hint}>Rate {cfg.usdKes} KES/USDC, fee {(cfg.feeBps / 100).toFixed(2)}%. Delivered to {address ? `${address.slice(0, 8)}…${address.slice(-6)}` : 'your wallet'}.</Text>
      {err && <Text style={styles.err}>{err}</Text>}
      <PrimaryButton label="Send M-Pesa prompt" busy={busy} disabled={!address} onPress={submit} />
    </View>
  );
}

function CashOut({ cfg, address, balance, unlock, onDone }: { cfg: RampServerConfig; address: string | null; balance: string | null; unlock: Unlock; onDone: () => void }) {
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [order, setOrder] = useState<RampOrder | null>(null);
  const cancel = useRef({ cancelled: false });
  useEffect(() => () => { cancel.current.cancelled = true; }, []);

  const max = Math.max(0, Math.floor(((Number(balance) || 0) - GAS_BUFFER) * 1e6) / 1e6);
  const usdcNum = Number(amount);
  const validAmt = /^\d+(\.\d{1,6})?$/.test(amount) && usdcNum > 0 && usdcNum <= max;
  const kesOut = validAmt ? previewKesForUsdc(cfg, usdcNum) : 0;

  async function submit() {
    setErr(null);
    if (!cfg.treasury) return setErr('Cash out is unavailable: the server has no treasury configured.');
    if (!normalizePhone(phone)) return setErr('Enter a valid Kenyan number, e.g. 0712 345 678');
    if (!validAmt) return setErr(`Enter an amount up to ${max.toFixed(2)} USDC (max 6 decimals)`);
    if (kesOut < cfg.minKes || kesOut > cfg.maxKes) return setErr(`Payout must be ${cfg.minKes}–${cfg.maxKes} KES`);
    setBusy(true);
    try {
      const wallet = await unlock();
      if (!wallet) throw new Error('Wallet locked');
      const treasury = cfg.treasury;
      const hash = await withRpc(async (p) => {
        const tx = await wallet.connect(p).sendTransaction({ to: treasury, value: ethers.parseUnits(amount, ACTIVE_CHAIN.usdc.decimals) });
        await tx.wait(1);
        return tx.hash;
      });
      setOrder({ id: '', kind: 'offramp', status: 'paid', usdc: amount, kes: kesOut, phoneMasked: '', txHash: undefined, mock: cfg.mock });
      const r = await startOfframp(wallet, phone, amount, hash);
      setOrder((o) => ({ ...(o as RampOrder), id: r.id, status: r.status }));
      const final = await pollOrder(r.id, setOrder, { signal: cancel.current });
      if (final.status === 'completed' || final.status === 'failed') onDone();
    } catch (e: any) {
      setErr(e.message ?? 'Something went wrong');
    } finally { setBusy(false); }
  }

  if (order) return <Timeline order={order} onReset={() => { setOrder(null); setAmount(''); }} />;

  return (
    <View style={styles.form}>
      <Field label="M-Pesa number" value={phone} onChangeText={setPhone} placeholder="0712 345 678" keyboardType="phone-pad" prefix="+254" />
      <Field label="Amount (USDC)" value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />
      <TouchableOpacity onPress={() => setAmount(max.toString())}>
        <Text style={styles.maxLink}>Max withdrawable: {max.toFixed(2)} USDC (keeps {GAS_BUFFER} for gas)</Text>
      </TouchableOpacity>
      <View style={styles.preview}>
        <Text style={styles.previewLabel}>You receive (approx.)</Text>
        <Text style={styles.previewValue}>{kesOut.toLocaleString()} KES</Text>
      </View>
      <Text style={styles.hint}>Your USDC is sent on-chain to the service treasury, then paid out to M-Pesa. If the payout fails it is refunded.</Text>
      {err && <Text style={styles.err}>{err}</Text>}
      <PrimaryButton label="Cash out to M-Pesa" busy={busy} disabled={!address || !cfg.treasury} onPress={submit} />
    </View>
  );
}

function Timeline({ order, onReset }: { order: RampOrder; onReset: () => void }) {
  const on = order.kind === 'onramp';
  const failed = order.status === 'failed';
  const rank = { pending: 0, paid: 1, delivering: 1, completed: 2, failed: -1 }[order.status];
  const steps = on
    ? ['STK prompt sent — approve on your phone', 'M-Pesa paid', 'USDC delivered']
    : ['USDC sent to treasury', 'Payout to M-Pesa started', 'M-Pesa received'];
  const stepDone = on
    ? [rank >= 0, rank >= 1, rank >= 2]
    : [true, rank >= 1, rank >= 2];
  return (
    <View style={styles.form}>
      <Eyebrow>{on ? 'Adding money' : 'Cashing out'}</Eyebrow>
      {steps.map((s, i) => (
        <View key={s} style={styles.step}>
          <Ionicons name={stepDone[i] ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={stepDone[i] ? COLORS.accent : COLORS.textDim} />
          <Text style={[styles.stepText, !stepDone[i] && { color: COLORS.textMuted }]}>{s}</Text>
        </View>
      ))}
      {order.mpesaReceipt ? <Text style={styles.hint}>M-Pesa receipt: {order.mpesaReceipt}{order.mock ? ' (simulated)' : ''}</Text> : null}
      {order.txHash && (
        <TouchableOpacity onPress={() => Linking.openURL(`${ACTIVE_CHAIN.explorer}/tx/${order.txHash}`)}>
          <Text style={styles.maxLink}>View transaction on Arcscan ↗{order.mock && on ? ' (simulated hash if treasury is mock)' : ''}</Text>
        </TouchableOpacity>
      )}
      {failed && <Text style={styles.err}>{order.reason ?? 'The order failed.'}</Text>}
      {order.status === 'completed' && <Text style={styles.ok}>Done — {on ? `${order.usdc} USDC delivered.` : `${order.kes} KES sent.`}</Text>}
      {(order.status === 'completed' || failed) && <PrimaryButton label="Start another" onPress={onReset} />}
    </View>
  );
}

function SecondaryOptions({ address }: { address: string | null }) {
  const cfg = getRampConfig();
  const card = !!cfg && !!address;
  return (
    <>
      <Eyebrow style={styles.eyebrow}>Card / bank</Eyebrow>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => Linking.openURL(card ? buildBuyUrl(cfg!, address!) : FAUCET_URL)}
      >
        <View style={styles.cardIcon}><Ionicons name="card-outline" size={22} color={COLORS.accent} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{card ? 'Buy USDC with card or bank' : 'Get testnet USDC (Circle faucet)'}</Text>
          <Text style={styles.cardSub}>{card ? 'Licensed provider; USDC lands in your wallet.' : 'Free: 20 USDC per address every 2 hours.'}</Text>
        </View>
        <Ionicons name="open-outline" size={18} color={COLORS.textDim} />
      </TouchableOpacity>
    </>
  );
}

function Field(p: { label: string; value: string; onChangeText: (s: string) => void; placeholder: string; keyboardType: any; prefix?: string }) {
  return (
    <View>
      <Text style={styles.label}>{p.label}</Text>
      <View style={styles.inputRow}>
        {p.prefix ? <Text style={styles.prefix}>{p.prefix}</Text> : null}
        <TextInput
          style={styles.input} value={p.value} onChangeText={p.onChangeText} placeholder={p.placeholder}
          placeholderTextColor={COLORS.textDim} keyboardType={p.keyboardType} autoCorrect={false}
        />
      </View>
    </View>
  );
}

function PrimaryButton({ label, onPress, busy, disabled }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean }) {
  return (
    <TouchableOpacity style={[styles.btn, (busy || disabled) && { opacity: 0.5 }]} disabled={busy || disabled} onPress={onPress}>
      {busy ? <ActivityIndicator color={COLORS.bg} /> : <Text style={styles.btnText}>{label}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.sm },
  tabs: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 4, marginBottom: SPACING.sm },
  tab: { flex: 1, paddingVertical: 10, borderRadius: RADIUS.sm, alignItems: 'center' },
  tabOn: { backgroundColor: COLORS.accentDim },
  tabText: { color: COLORS.textMuted, fontWeight: '600', fontSize: 14 },
  tabTextOn: { color: COLORS.accent },

  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: COLORS.warningSoft, borderWidth: 1, borderColor: 'rgba(245,166,35,0.3)',
    borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm,
  },
  bannerText: { flex: 1, fontSize: 12.5, color: COLORS.warning, lineHeight: 18 },

  form: { gap: SPACING.sm },
  label: { fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14 },
  prefix: { color: COLORS.textMuted, marginRight: 8, fontFamily: FONTS.mono },
  input: { flex: 1, color: COLORS.text, fontSize: 16, paddingVertical: 14 },
  preview: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: COLORS.surfaceAlt, borderRadius: RADIUS.md, padding: SPACING.md },
  previewLabel: { color: COLORS.textMuted, fontSize: 13 },
  previewValue: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  hint: { fontSize: 12, color: COLORS.textDim, lineHeight: 18 },
  err: { fontSize: 13, color: COLORS.error },
  ok: { fontSize: 14, color: COLORS.success, fontWeight: '600' },
  maxLink: { fontSize: 12.5, color: COLORS.accent },
  btn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, paddingVertical: 15, alignItems: 'center', marginTop: SPACING.xs },
  btnText: { color: COLORS.bg, fontWeight: '700', fontSize: 15 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  stepText: { color: COLORS.text, fontSize: 14 },

  eyebrow: { marginTop: SPACING.lg, marginBottom: 2 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, padding: SPACING.md },
  cardIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accentSoft },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  cardSub: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2, lineHeight: 18 },
});
