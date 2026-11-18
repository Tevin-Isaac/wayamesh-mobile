import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession, lock, logout, exportBackup } from '@/lib/session'
import { useData, setSettings } from '@/lib/store'
import { SUPPORTED_LANGUAGES, setLang, useT } from '@/lib/i18n'
import { CHAIN, FAUCET_URL, MESHPAY_ADDRESS, addressUrl } from '@/lib/chain'
import { parseUsdc, shortAddr } from '@/lib/money'
import { Avatar, Badge, Eyebrow, Field, Modal, Row, Toggle, toast, Button } from '@/components/ui'
import { Icon } from '@/components/Icon'

const LOCK_OPTIONS = [1, 2, 5, 15, 0]

export function Settings() {
  const { address } = useSession()
  const { settings } = useData()
  const nav = useNavigate()
  const { t, lang } = useT()
  const [picker, setPicker] = useState(false)
  const [limit, setLimit] = useState(settings.acceptLimit)
  const [limitErr, setLimitErr] = useState('')
  const cur = SUPPORTED_LANGUAGES.find((l) => l.code === lang) ?? SUPPORTED_LANGUAGES[0]

  function downloadBackup() {
    const json = exportBackup()
    if (!json) return toast('No backup available.')
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'wayamesh-backup.json'
    a.click()
    URL.revokeObjectURL(url)
    toast('Encrypted backup downloaded. You need your PIN to restore it.')
  }

  function saveLimit(v: string) {
    setLimit(v)
    try {
      if (v.trim() === '') throw new Error('Enter an amount')
      parseUsdc(v)
      setLimitErr('')
      setSettings({ acceptLimit: v.trim() })
    } catch (e) { setLimitErr((e as Error).message) }
  }

  function signOut() {
    if (window.confirm(`${t('settings.signOutConfirmTitle', 'Sign Out')}\n\n${t('settings.signOutConfirmMsg', 'This will remove your wallet from this device. Make sure your backup is saved.')} Make sure you have your seed phrase or private key saved before continuing.`)) {
      logout()
      nav('/app/onboarding', { replace: true })
    }
  }

  return (
    <div className="screen">
      <h1 className="heading">{t('settings.title', 'Settings')}</h1>
      <div className="row">
        <Avatar seed={address ?? 'You'} size={56} />
        <div className="grow"><div style={{ fontSize: 17, fontWeight: 600 }}>Your wallet</div><div className="mono muted" style={{ fontSize: 13 }}>{address ? `${address.slice(0, 10)}…${address.slice(-8)}` : '—'}</div></div>
        <Badge status="accent">Arc</Badge>
      </div>

      <Eyebrow>{t('settings.security', 'Security')}</Eyebrow>
      <div className="group">
        <Row icon="lock" label="Lock wallet now" onClick={() => { lock(); nav('/app/unlock', { replace: true }) }} />
        <hr />
        <div className="group-row">
          <span className="ico"><Icon name="time" /></span>
          <label htmlFor="autolock" className="lbl">Auto-lock when idle</label>
          <select id="autolock" value={settings.autoLockMinutes} onChange={(e) => { setSettings({ autoLockMinutes: Number(e.target.value) }); toast('Auto-lock updated.') }}
            style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px' }}>
            {LOCK_OPTIONS.map((m) => <option key={m} value={m}>{m === 0 ? 'Never' : `${m} min`}</option>)}
          </select>
        </div>
        <hr />
        <Row icon="key" label="Recovery phrase" to="/app/backup" />
        <hr />
        <Row icon="users" label={t('settings.guardianRecovery', 'Guardian Recovery')} value="Phone app only" to="/app/guardian" />
      </div>

      <Eyebrow>{t('settings.recovery', 'Recovery')}</Eyebrow>
      <div className="group">
        <Row icon="cloud" label="Encrypted backup file" value="PIN protected" onClick={downloadBackup} />
      </div>

      <Eyebrow>Gasless USDC · Beta</Eyebrow>
      <div className="group">
        <Row icon="card" label="Smart account" value="Phone app only" to="/app/smart-account" />
        <hr />
        <Row icon="spark" label="Agent wallet" value="Mandate" to="/app/agent" />
      </div>

      <Eyebrow>Preferences</Eyebrow>
      <div className="group">
        <Row icon="zap" label={t('settings.autoSettle', 'Auto-settle when online')} control={<Toggle checked={settings.autoSettle} onChange={(v) => setSettings({ autoSettle: v })} label="Auto-settle when online" />} />
        <hr />
        <Row icon="lang" label={t('settings.language', 'Language')} value={`${cur.flag}  ${cur.name}`} onClick={() => setPicker(true)} />
      </div>
      <p className="dim">Auto-settle submits payments you hold while this tab is open and online. It spends a little USDC for network fees.</p>
      <Field label="Largest payment to accept offline without a warning (USDC)" inputMode="decimal" value={limit} onChange={(e: any) => saveLimit(e.target.value)} error={!!limitErr} hint={limitErr || 'Bigger incoming payments are flagged as risky before you accept.'} />

      <Eyebrow>{t('settings.network', 'Network')}</Eyebrow>
      <div className="group">
        <Row icon="globe" label={t('settings.network', 'Network')} value="Arc Testnet" />
        <hr />
        <Row icon="link" label={t('settings.chainId', 'Chain ID')} value={String(CHAIN.id)} />
        <hr />
        <Row icon="shield" label="MeshPayV2 contract" value={shortAddr(MESHPAY_ADDRESS)} external={addressUrl(MESHPAY_ADDRESS)} />
        <hr />
        <Row icon="water" label="Get testnet USDC" external={FAUCET_URL} />
      </div>

      <Eyebrow>{t('settings.wallet', 'Wallet')}</Eyebrow>
      <div className="group">
        <Row icon="qr" label={t('settings.receiveUsdc', 'Receive USDC')} to="/app/receive" />
        <hr />
        <Row icon="wallet" label="Offline reserve" to="/app/reserve" />
        <hr />
        <Row icon="card" label="Add money · Cash out" to="/app/ramp" />
      </div>

      <Button variant="danger" onClick={signOut}>{t('settings.signOut', 'Sign Out')}</Button>
      <p className="dim center-text">{t('settings.signOutHint', 'Removes wallet from this device. Restore it later with your seed phrase.')}</p>
      <p className="dim center-text">Wayamesh · web v0.1.0 · Built on Arc</p>

      {picker && (
        <Modal title={t('settings.language', 'Language')} onClose={() => setPicker(false)}>
          <div className="group" role="listbox" aria-label="Language">
            {SUPPORTED_LANGUAGES.map((l, i) => (
              <div key={l.code}>
                {i > 0 && <hr />}
                <button role="option" aria-selected={l.code === lang} className="group-row" onClick={() => { setLang(l.code); setPicker(false) }}>
                  <span style={{ fontSize: 22 }}>{l.flag}</span>
                  <span className="lbl" style={{ color: l.code === lang ? 'var(--accent)' : undefined, fontWeight: l.code === lang ? 700 : 400 }}>{l.name}</span>
                  {l.code === lang && <Icon name="check" className="" size={18} />}
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
