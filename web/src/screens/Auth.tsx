import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import {
  clearFreshPhrase, getFreshPhrase, logout, restoreBackup, revealSecret, setPin, startCreate, startImport, unlockWithPin, useSession,
} from '@/lib/session'
import { loadVault, pinProblem, lockoutRemainingSeconds } from '@/lib/vault'
import { fmtDuration, shortAddr } from '@/lib/money'
import { useT } from '@/lib/i18n'
import { Button, Card, Field, SecretField, ScreenHeader, Avatar, toast, copyWithAutoClear } from '@/components/ui'
import { Icon } from '@/components/Icon'

const ARC = [[58, 124], [160, 36], [262, 124]]

function Hero() {
  return (
    <div className="hero-svg">
      <svg viewBox="0 0 320 210" role="img" aria-label="A coin travelling from you to anyone">
        <defs>
          <radialGradient id="recv" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3ED9B8" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#3ED9B8" stopOpacity="0" />
          </radialGradient>
        </defs>
        {[[28, 54], [292, 48], [160, 188], [40, 168], [276, 150]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 2 ? 2 : 2.6} fill="#3ED9B8" opacity="0.3" />
        ))}
        <path d="M58 124 Q160 36 262 124" fill="none" stroke="#1E1E35" strokeWidth="1.5" strokeDasharray="5 6" opacity="0.6" />
        <path d="M58 124 Q160 36 262 124" fill="none" stroke="#3ED9B8" strokeWidth="2" opacity="0.45" />
        <circle cx="262" cy="124" r="40" fill="url(#recv)" opacity="0.5" />
        <circle cx={ARC[0][0]} cy={ARC[0][1]} r="27" fill="#0F0F1A" stroke="#3ED9B8" strokeWidth="1.5" />
        <rect x="49.5" y="111" width="17" height="26" rx="3.5" fill="none" stroke="#3ED9B8" strokeWidth="1.6" />
        <circle cx="58" cy="132" r="1.8" fill="#3ED9B8" />
        <circle cx="160" cy="80" r="16" fill="#0F0F1A" stroke="#3ED9B8" strokeWidth="1.3" strokeOpacity="0.75" />
        <circle cx="160" cy="80" r="3" fill="#3ED9B8" fillOpacity="0.85" />
        <circle cx="262" cy="124" r="27" fill="#0F0F1A" stroke="#3ED9B8" strokeWidth="1.5" />
        <rect x="253.5" y="111" width="17" height="26" rx="3.5" fill="none" stroke="#3ED9B8" strokeWidth="1.6" />
        <circle cx="262" cy="132" r="1.8" fill="#3ED9B8" />
        <text x="58" y="172" textAnchor="middle" fill="#8888A0" fontSize="11">You</text>
        <text x="262" y="172" textAnchor="middle" fill="#8888A0" fontSize="11">Anyone</text>
      </svg>
      <span className="coin" aria-hidden="true">$</span>
    </div>
  )
}

function MeshBg() {
  const pts = [[8, 14], [30, 6], [55, 20], [80, 8], [92, 26], [18, 44], [45, 52], [72, 46], [90, 62], [10, 78], [35, 88], [62, 80], [85, 92]]
  return (
    <svg className="mesh-bg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {pts.map((p, i) => i > 0 && <line key={i} x1={pts[i - 1][0]} y1={pts[i - 1][1]} x2={p[0]} y2={p[1]} stroke="#1E1E35" strokeWidth="0.15" />)}
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="0.5" fill="#3ED9B8" opacity="0.4" />)}
    </svg>
  )
}

export function Onboarding() {
  const s = useSession()
  const nav = useNavigate()
  const { t } = useT()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (s.status === 'locked') return <Navigate to="/app/unlock" replace />
  if (s.status === 'unlocked') return <Navigate to="/app" replace />

  function create() {
    setBusy(true)
    setErr('')
    try {
      startCreate(12)
      nav('/app/pin-setup')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create a wallet')
      setBusy(false)
    }
  }

  return (
    <main className="onboard">
      <MeshBg />
      <div className="brand-col">
        <img src={`${import.meta.env.BASE_URL}mark.png`} alt="" />
        <div className="wordmark">WAYAMESH</div>
      </div>
      <div className="brand-col" style={{ gap: 8 }}>
        <Hero />
        <h1 className="headline">
          Send money<br />
          <span className="serif">off the grid.</span>
        </h1>
      </div>
      <div className="ctas">
        {err && <p className="error-text center-text" role="alert">{err}</p>}
        <Button size="lg" onClick={create} disabled={busy}>{busy ? t('onboarding.creating', 'Creating wallet…') : t('onboarding.create', 'Create Wallet')}</Button>
        <Link to="/app/import" className="btn ghost">{t('onboarding.import', 'Import existing wallet')}</Link>
        <div className="row" style={{ justifyContent: 'center', gap: 20, flexWrap: 'wrap' }}>
          <Link to="/app/restore" className="alt-link">Restore from backup file</Link>
          <a href="/" className="alt-link">← Website</a>
        </div>
      </div>
    </main>
  )
}

export function ImportWallet() {
  const s = useSession()
  const nav = useNavigate()
  const { t } = useT()
  const [value, setValue] = useState('')
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  if (s.status === 'locked') return <Navigate to="/app/unlock" replace />
  const words = value.trim().split(/\s+/).filter(Boolean).length
  const isPk = /^(0x)?[0-9a-fA-F]{64}$/.test(value.trim())
  const isMn = words >= 12
  const hint = !value.trim()
    ? t('import.hintDefault', 'Enter your private key (0x…) or 12/24-word seed phrase')
    : isPk ? t('import.hintPk', 'Private key detected')
    : isMn ? t('import.hintMnemonic', 'Seed phrase detected ({{count}} words)', { count: words })
    : t('import.hintWords', '{{count}} word — need 12 or 24', { count: words })

  function submit() {
    setErr('')
    try {
      startImport(value)
      setValue('')
      setDone(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not import wallet. Check your input and try again.')
    }
  }

  if (done) {
    return (
      <div className="screen center" style={{ maxWidth: 520, margin: '0 auto' }}>
        <div className="big-circle"><Icon name="check" /></div>
        <h1 className="title">{t('import.success', 'Wallet imported')}</h1>
        <p className="subtitle">Your wallet has been restored. Set a PIN to encrypt it on this device.</p>
        <Button onClick={() => nav('/app/pin-setup')}>{t('import.setPIN', 'Set PIN')}</Button>
      </div>
    )
  }
  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <ScreenHeader title="Import wallet" to="/app/onboarding" />
      <form className="screen" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <p className="subtitle">{t('import.desc', 'Restore an existing wallet using its private key or seed phrase. Your key never leaves this device.')}</p>
        <Field
          label={t('import.label', 'Private Key or Seed Phrase')}
          multiline mono value={value} onChange={(e: any) => { setValue(e.target.value); setErr('') }}
          placeholder={t('import.placeholder', '0x… or word1 word2 word3 …')}
          autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off"
          hint={err || hint} error={!!err} hintActive={!!value.trim() && (isPk || isMn)}
        />
        <Card tone="error" tight>
          <div className="row" style={{ alignItems: 'flex-start', color: 'var(--error)', fontSize: 13 }}>
            <Icon name="warn" size={16} />
            <span>{t('import.warning', 'Never share your private key or seed phrase with anyone.')}</span>
          </div>
        </Card>
        <p className="dim">This site only runs in your browser. Import only on a device you trust.</p>
        <Button type="submit" disabled={!value.trim()}>{t('import.button', 'Import Wallet')}</Button>
      </form>
    </div>
  )
}

export function PinSetup() {
  const s = useSession()
  const nav = useNavigate()
  const { t } = useT()
  const [step, setStep] = useState<'create' | 'confirm'>('create')
  const [pin, setPinValue] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (s.status === 'locked') return <Navigate to="/app/unlock" replace />
  if (s.status === 'none') return <Navigate to="/app/onboarding" replace />
  if (s.status === 'unlocked') return <Navigate to="/app" replace />

  function next() {
    const problem = pinProblem(pin)
    if (problem) return setErr(problem)
    setErr('')
    setStep('confirm')
  }

  async function submit() {
    if (confirm !== pin) {
      setConfirm('')
      return setErr(t('pin.mismatch', 'PINs do not match — try again'))
    }
    setBusy(true)
    setErr('')
    await new Promise((r) => setTimeout(r, 30)) // let the busy state paint before the key derivation blocks
    try {
      await setPin(pin)
      nav('/app/backup?first=1', { replace: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('pin.backupFailed', 'Backup failed — try again'))
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <form className="screen" style={{ paddingTop: 48 }} onSubmit={(e) => { e.preventDefault(); step === 'create' ? next() : void submit() }}>
        <div className="stack">
          <h1 className="title">{step === 'create' ? t('pin.createTitle', 'Create PIN') : t('pin.confirmTitle', 'Confirm PIN')}</h1>
          <p className="subtitle">
            {step === 'create'
              ? 'Your PIN encrypts your wallet on this device. Use 6 digits or more, or a longer passphrase.'
              : t('pin.confirmSub', 'Re-enter your PIN to confirm')}
          </p>
        </div>
        {step === 'create' ? (
          <SecretField
            label="PIN" value={pin} onChange={(e: any) => { setPinValue(e.target.value); setErr('') }} show={show} onToggle={() => setShow((v) => !v)}
            inputMode="text" autoComplete="new-password" autoFocus placeholder="••••••" error={!!err} hint={err || 'Minimum 6 characters'}
          />
        ) : (
          <SecretField
            label="Confirm PIN" value={confirm} onChange={(e: any) => { setConfirm(e.target.value); setErr('') }} show={show} onToggle={() => setShow((v) => !v)}
            autoComplete="new-password" autoFocus placeholder="••••••" error={!!err} hint={err || undefined}
          />
        )}
        <p className="dim">
          Encrypted in this browser with PBKDF2 (600,000 rounds) + AES-GCM. We never see your PIN and cannot reset it. If you forget it,
          restore with your seed phrase.
        </p>
        <Button type="submit" loading={busy} disabled={busy || (step === 'create' ? !pin : !confirm)}>
          {busy ? t('pin.encrypting', 'Encrypting…') : step === 'create' ? 'Continue' : 'Save PIN'}
        </Button>
        {step === 'confirm' && !busy && <button type="button" className="alt-link" onClick={() => { setStep('create'); setConfirm(''); setErr('') }}>← Change PIN</button>}
      </form>
    </div>
  )
}

export function Unlock() {
  const s = useSession()
  const nav = useNavigate()
  const { t } = useT()
  const [pin, setPinValue] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(lockoutRemainingSeconds())

  useEffect(() => {
    if (wait <= 0) return
    const id = setInterval(() => setWait(lockoutRemainingSeconds()), 1000)
    return () => clearInterval(id)
  }, [wait])

  if (s.status === 'none') return <Navigate to="/app/onboarding" replace />
  if (s.status === 'unlocked') return <Navigate to="/app" replace />
  const locked = wait > 0
  const addr = loadVault()?.address ?? s.address

  async function submit() {
    if (!pin || busy || locked) return
    setBusy(true)
    setErr('')
    await new Promise((r) => setTimeout(r, 30))
    const res = await unlockWithPin(pin)
    setBusy(false)
    if (res.ok) return nav('/app', { replace: true })
    setPinValue('')
    setWait(res.waitSeconds)
    setErr(res.reason)
  }

  function signOut() {
    if (window.confirm(t('settings.signOutConfirmMsg', 'This will remove your wallet from this device. Make sure your backup is saved.'))) {
      logout()
      nav('/app/onboarding', { replace: true })
    }
  }

  return (
    <form className="screen center" style={{ maxWidth: 440, margin: '0 auto' }} onSubmit={(e) => { e.preventDefault(); void submit() }}>
      <Avatar seed={addr ?? 'You'} size={64} />
      <div className="stack" style={{ alignItems: 'center' }}>
        <h1 className="title">Welcome back</h1>
        {addr && <p className="subtitle mono">{shortAddr(addr)}</p>}
        <p className="subtitle">Enter your PIN to unlock your wallet.</p>
      </div>
      <div style={{ width: '100%' }}>
        <SecretField label="PIN" value={pin} onChange={(e: any) => { setPinValue(e.target.value); setErr('') }} show={show} onToggle={() => setShow((v) => !v)}
          autoComplete="current-password" autoFocus disabled={locked} error={!!err && !locked} />
      </div>
      {locked ? (
        <p style={{ color: 'var(--warning)', fontSize: 14 }} role="alert">{t('restore.tooMany', 'Too many attempts.\nTry again in {{time}}', { time: fmtDuration(wait) })}</p>
      ) : err ? <p className="error-text" role="alert">{err}</p> : null}
      <div style={{ width: '100%' }}><Button type="submit" loading={busy} disabled={!pin || busy || locked}>{busy ? t('restore.decrypting', 'Decrypting…') : 'Unlock'}</Button></div>
      <Link to="/app/restore" className="alt-link">Restore from a different backup file</Link>
      <button type="button" className="alt-link" onClick={signOut}>Forgot PIN? Remove this wallet and import your seed phrase</button>
    </form>
  )
}

export function Restore() {
  const s = useSession()
  const nav = useNavigate()
  const { t } = useT()
  const [json, setJson] = useState('')
  const [pin, setPinValue] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (s.status === 'unlocked') return <Navigate to="/app" replace />
  let addr: string | null = null
  try { addr = json ? (JSON.parse(json).address as string) : null } catch { /* not json yet */ }

  async function onFile(f: File | undefined) {
    if (!f) return
    setErr('')
    setJson(await f.text())
  }

  async function submit() {
    setBusy(true)
    setErr('')
    await new Promise((r) => setTimeout(r, 30))
    const res = await restoreBackup(json, pin)
    setBusy(false)
    if (res.ok) return nav('/app', { replace: true })
    setPinValue('')
    setErr(res.waitSeconds ? t('restore.tooMany', 'Too many attempts.\nTry again in {{time}}', { time: fmtDuration(res.waitSeconds) }) : res.reason)
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <ScreenHeader title={t('restore.title', 'Restore Wallet')} to="/app/onboarding" />
      <form className="screen" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        {addr && <p className="subtitle center-text">{t('restore.foundBackup', 'Backup found for\n{{addr}}', { addr: shortAddr(addr) })}</p>}
        <div className="field">
          <label htmlFor="bk">Backup file</label>
          <input id="bk" type="file" accept=".json,application/json" onChange={(e) => void onFile(e.target.files?.[0])} className="input-row" style={{ padding: 12 }} />
          <div className="hint">The encrypted file you saved from Settings → Cloud backup (wayamesh-backup.json).</div>
        </div>
        <Field label="Or paste the backup" multiline mono value={json} onChange={(e: any) => setJson(e.target.value)} placeholder='{"v":1,"kdf":"pbkdf2-sha256",…}' spellCheck={false} />
        <SecretField label="PIN" value={pin} onChange={(e: any) => { setPinValue(e.target.value); setErr('') }} show={show} onToggle={() => setShow((v) => !v)}
          autoComplete="current-password" error={!!err} hint={err || t('restore.hint', 'Enter your PIN to decrypt your wallet')} />
        <Button type="submit" loading={busy} disabled={!json.trim() || !pin || busy}>{busy ? t('restore.decrypting', 'Decrypting…') : 'Restore'}</Button>
        <Link to="/app/import" className="alt-link">Recover with a seed phrase instead</Link>
        <Link to="/app/onboarding" className="alt-link">{t('restore.createInstead', 'Create a new wallet instead')}</Link>
      </form>
    </div>
  )
}

export function Backup() {
  const s = useSession()
  const nav = useNavigate()
  const { t } = useT()
  const [params] = useSearchParams()
  const first = params.get('first') === '1'
  const [phrase, setPhrase] = useState<string | null>(() => (first ? getFreshPhrase() : null))
  const [hidden, setHidden] = useState(true)
  const [pin, setPinValue] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [noPhrase, setNoPhrase] = useState(false)

  useEffect(() => () => { if (first) clearFreshPhrase() }, [first])

  if (s.status !== 'unlocked') return <Navigate to="/app" replace />

  async function reveal() {
    setBusy(true)
    setErr('')
    await new Promise((r) => setTimeout(r, 30))
    const sec = await revealSecret(pin)
    setBusy(false)
    if (!sec) return setErr('Wrong PIN.')
    if (sec.kind !== 'mnemonic') return setNoPhrase(true)
    setPhrase(sec.value)
  }

  const words = phrase ? phrase.split(' ') : []
  const showNoPhrase = noPhrase || (!s.hasMnemonic && !phrase)

  return (
    <div>
      {!first && <ScreenHeader title="Recovery phrase" to="/app/settings" />}
      <div className="screen" style={first ? { paddingTop: 40 } : undefined}>
        {first && <div className="stack"><h1 className="title">Back up your wallet</h1><p className="subtitle">Your wallet is created and encrypted. Write down this seed phrase now — it is the only way to restore it if you forget your PIN or lose this browser's data.</p></div>}
        <div className="banner warn">
          <Icon name="warn" />
          <span>Never share your seed phrase with anyone. Anyone with these words can steal all your funds. Don't screenshot it or store it in a notes app.</span>
        </div>
        {showNoPhrase ? (
          <div className="stack center-text" style={{ alignItems: 'center', padding: '32px 0' }}>
            <Icon name="key" size={40} className="muted" />
            <p style={{ fontWeight: 600, color: 'var(--muted)' }}>{t('backup.noMnemonic', 'No seed phrase')}</p>
            <p className="dim">{t('backup.noMnemonicSub', 'This wallet was imported from a private key — no seed phrase is available.')}</p>
          </div>
        ) : !phrase ? (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void reveal() }}>
            <p className="subtitle">Enter your PIN to show the phrase.</p>
            <Field label="PIN" type="password" value={pin} onChange={(e: any) => { setPinValue(e.target.value); setErr('') }} autoComplete="current-password" error={!!err} hint={err || undefined} />
            <Button type="submit" loading={busy} disabled={!pin || busy}>Show seed phrase</Button>
          </form>
        ) : (
          <>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {hidden ? (
                <button className="stack" style={{ alignItems: 'center', padding: 32, width: '100%', color: 'var(--accent)', fontWeight: 600 }} onClick={() => setHidden(false)}>
                  <Icon name="eye" size={24} />
                  <span>{t('backup.reveal', 'Tap to reveal seed phrase')}</span>
                </button>
              ) : (
                <ol className="words" style={{ listStyle: 'none' }}>
                  {words.map((w, i) => <li key={i} className="word"><span className="n">{i + 1}</span><span className="w mono">{w}</span></li>)}
                </ol>
              )}
            </div>
            {!hidden && (
              <>
                <Button icon="copy" onClick={async () => toast((await copyWithAutoClear(phrase, 30_000)) ? 'Seed phrase copied.' : 'Could not copy. Write the words down instead.')}>Copy all words</Button>
                <Button variant="ghost" onClick={() => setHidden(true)}>{t('backup.hide', 'Hide')} seed phrase</Button>
              </>
            )}
            <p className="dim center-text">Write these {words.length} words on paper in order and store them somewhere secure offline.</p>
          </>
        )}
        {first && <Button size="lg" onClick={() => { clearFreshPhrase(); nav('/app', { replace: true }) }}>{phrase ? "I've saved it — continue" : 'Continue'}</Button>}
      </div>
    </div>
  )
}
