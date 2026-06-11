import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ethers } from 'ethers';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '@/hooks/useWallet';
import { estimateGas, buildOfflineTransfer, type GasEstimate } from '@/wallet/transactions';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import { CHAIN } from '@/constants/chain';

type Step = 'estimating' | 'review' | 'signing' | 'done' | 'error';

export default function ConfirmScreen() {
  const { to, amount } = useLocalSearchParams<{ to: string; amount: string }>();
  const { address, balance, unlock } = useWallet();

  const [step, setStep]           = useState<Step>('estimating');
  const [gas, setGas]             = useState<GasEstimate | null>(null);
  const [txHash, setTxHash]       = useState<string | null>(null);
  const [errorMsg, setErrorMsg]   = useState('');

  const checksumTo = to ? ethers.getAddress(to) : '';
  const amountNum  = parseFloat(amount ?? '0');
  const totalCost  = gas
    ? (amountNum + parseFloat(gas.totalFeeUsdc)).toFixed(6)
    : '—';
  const balanceNum = parseFloat(balance ?? '0');
  const sufficient = gas ? balanceNum >= amountNum + parseFloat(gas.totalFeeUsdc) : false;

  useEffect(() => {
    if (!to || !amount || !address) return;
    estimateGas(address, to, amount)
      .then(g => { setGas(g); setStep('review'); })
      .catch(() => { setGas(null); setStep('review'); }); // offline — proceed without live estimate
  }, []);

  async function handleConfirm() {
    setStep('signing');
    try {
      const wallet = await unlock();
      if (!wallet) {
        setStep('review');
        return;
      }
      const tx = await buildOfflineTransfer(wallet, to!, amount!, gas ?? undefined);
      setTxHash(tx.hash);
      setStep('done');
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Signing failed');
      setStep('error');
    }
  }

  // ── Estimating ────────────────────────────────────────────────────────────
  if (step === 'estimating') {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.accent} size="large" />
          <Text style={styles.loadingText}>Estimating network fee…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.center}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={40} color={COLORS.bg} />
          </View>
          <Text style={styles.successTitle}>Transaction signed</Text>
          <Text style={styles.successSub}>
            Queued offline. It will relay over Bluetooth mesh and settle on Arc when you're online.
          </Text>
          {txHash && (
            <TouchableOpacity
              onPress={() => Linking.openURL(`${CHAIN.explorer}/tx/${txHash}`)}
              activeOpacity={0.7}
            >
              <Text style={styles.explorerLink}>View on Arc Explorer →</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.replace('/(tabs)')} activeOpacity={0.85}>
            <Text style={styles.doneBtnText}>Back to Wallet</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (step === 'error') {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={56} color={COLORS.error} />
          <Text style={styles.errorTitle}>Transaction failed</Text>
          <Text style={styles.errorMsg}>{errorMsg}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => setStep('review')} activeOpacity={0.85}>
            <Text style={styles.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Review / Signing ──────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* Amount hero */}
        <View style={styles.amountHero}>
          <Text style={styles.amountValue}>{amountNum.toFixed(6)}</Text>
          <Text style={styles.amountCurrency}>USDC</Text>
        </View>

        {/* Transaction details */}
        <View style={styles.detailCard}>
          <Row label="From">
            <Text style={styles.addrText} numberOfLines={1}>
              {address ? shortenAddr(address) : '—'}
            </Text>
          </Row>
          <Divider />
          <Row label="To">
            <Text style={styles.addrText} numberOfLines={1}>{shortenAddr(checksumTo)}</Text>
          </Row>
          <Divider />
          <Row label="Full address">
            <Text style={[styles.addrText, styles.mono]} numberOfLines={2} selectable>
              {checksumTo}
            </Text>
          </Row>
        </View>

        {/* Fee breakdown */}
        <View style={styles.detailCard}>
          <Row label="Amount">
            <Text style={styles.valueText}>{amountNum.toFixed(6)} USDC</Text>
          </Row>
          <Divider />
          <Row label="Network fee">
            {gas ? (
              <Text style={styles.valueText}>{parseFloat(gas.totalFeeUsdc).toFixed(6)} USDC</Text>
            ) : (
              <Text style={styles.valueTextDim}>Offline — using ~0.000840 USDC estimate</Text>
            )}
          </Row>
          <Divider />
          <Row label="Total (max)">
            <Text style={[styles.valueText, styles.totalValue]}>{totalCost} USDC</Text>
          </Row>
        </View>

        {/* Network info */}
        <View style={styles.detailCard}>
          <Row label="Network">
            <Text style={styles.valueText}>{CHAIN.name}</Text>
          </Row>
          <Divider />
          <Row label="Settlement">
            <Text style={styles.valueText}>~480ms finality on Arc</Text>
          </Row>
          <Divider />
          <Row label="Relay method">
            <Text style={styles.valueText}>Offline → BLE mesh → Arc</Text>
          </Row>
        </View>

        {!sufficient && gas && (
          <View style={styles.warningBox}>
            <Ionicons name="warning-outline" size={16} color={COLORS.warning} />
            <Text style={styles.warningText}>
              Insufficient balance for amount + gas. Balance: {parseFloat(balance ?? '0').toFixed(4)} USDC
            </Text>
          </View>
        )}

        <Text style={styles.biometricHint}>
          You will be asked to authenticate before signing.
        </Text>
      </ScrollView>

      {/* Footer CTA */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.confirmBtn,
            (step === 'signing' || !sufficient) && styles.confirmBtnDisabled,
          ]}
          onPress={handleConfirm}
          disabled={step === 'signing' || !sufficient}
          activeOpacity={0.85}
        >
          {step === 'signing' ? (
            <ActivityIndicator color={COLORS.bg} size="small" />
          ) : (
            <>
              <Ionicons name="finger-print-outline" size={20} color={COLORS.bg} />
              <Text style={styles.confirmText}>Confirm & Sign</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValue}>{children}</View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function shortenAddr(addr: string): string {
  if (addr.length < 20) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-8)}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content:   { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xl },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.md },

  loadingText:   { color: COLORS.textMuted, fontSize: 14, marginTop: SPACING.sm },

  amountHero: { alignItems: 'center', paddingVertical: SPACING.md },
  amountValue: {
    fontSize: 52, fontWeight: '800', color: COLORS.text, letterSpacing: -2,
  },
  amountCurrency: { fontSize: 18, color: COLORS.accent, fontWeight: '700', marginTop: -4 },

  detailCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 14,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  rowLabel: { fontSize: 13, color: COLORS.textMuted, flexShrink: 0, paddingTop: 1 },
  rowValue:  { flex: 1, alignItems: 'flex-end' },
  divider:   { height: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.md },

  addrText:  { fontSize: 13, color: COLORS.text, textAlign: 'right' },
  mono:      { fontFamily: 'monospace', fontSize: 11, lineHeight: 16 },
  valueText: { fontSize: 14, color: COLORS.text, fontWeight: '600', textAlign: 'right' },
  valueTextDim: { fontSize: 12, color: COLORS.textDim, textAlign: 'right' },
  totalValue: { color: COLORS.accent },

  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(245,166,35,0.1)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.25)',
    padding: SPACING.md,
  },
  warningText: { flex: 1, fontSize: 13, color: COLORS.warning, lineHeight: 18 },

  biometricHint: {
    fontSize: 12,
    color: COLORS.textDim,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },

  footer: {
    flexDirection: 'row',
    gap: SPACING.sm,
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelText: { color: COLORS.textMuted, fontWeight: '600', fontSize: 15 },
  confirmBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  confirmBtnDisabled: { opacity: 0.45 },
  confirmText: { color: COLORS.bg, fontWeight: '700', fontSize: 15 },

  // Done state
  successIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  successTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text },
  successSub:   { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 22 },
  explorerLink: {
    color: COLORS.accent, fontSize: 14, textDecorationLine: 'underline', marginTop: SPACING.xs,
  },
  doneBtn: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    paddingHorizontal: 40,
  },
  doneBtnText: { color: COLORS.bg, fontWeight: '700', fontSize: 15 },

  // Error state
  errorTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  errorMsg:   { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  retryBtnText: { color: COLORS.text, fontWeight: '600', fontSize: 15 },
});
