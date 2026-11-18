import { useEffect, useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon, type IconName } from './Icon'
import { getContact } from '@/lib/store'
import { shortAddr } from '@/lib/money'

export function Button({
  variant = 'primary', size, loading, icon, children, className = '', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'lg'; loading?: boolean; icon?: IconName }) {
  const off = rest.disabled || loading
  return (
    <button
      {...rest}
      disabled={off}
      className={`btn ${variant === 'primary' ? '' : variant} ${size ?? ''} ${className}`}
    >
      {loading ? <span className="spinner" role="status" aria-label="Loading" /> : (<>{icon && <Icon name={icon} size={18} />}{children}</>)}
    </button>
  )
}

export function Card({ tone, accent, children, className = '', tight }: { tone?: 'warning' | 'error' | 'pending'; accent?: boolean; children: ReactNode; className?: string; tight?: boolean }) {
  return <div className={`card ${tone ?? ''} ${accent ? 'accent' : ''} ${tight ? 'tight' : ''} ${className}`}>{children}</div>
}

export function Badge({ status = 'neutral', children }: { status?: 'pending' | 'relayed' | 'settled' | 'failed' | 'accent' | 'neutral'; children: string }) {
  return <span className={`badge ${status}`}>{children}</span>
}

export const Eyebrow = ({ children, className = '' }: { children: ReactNode; className?: string }) => <div className={`eyebrow ${className}`}>{children}</div>

export function Field({
  label, hint, hintActive, error, mono, right, multiline, ...rest
}: {
  label?: string; hint?: string; hintActive?: boolean; error?: boolean; mono?: boolean; right?: ReactNode; multiline?: boolean
} & Record<string, any>) {
  const id = useId()
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      <div className={`input-row ${error ? 'error' : ''} ${mono ? 'mono' : ''}`}>
        {multiline ? <textarea id={id} rows={4} {...rest} /> : <input id={id} {...rest} />}
        {right && <div className="slot">{right}</div>}
      </div>
      {hint && <div className={`hint ${error ? 'err' : hintActive ? 'active' : ''}`} role={error ? 'alert' : undefined}>{hint}</div>}
    </div>
  )
}

/** Password-style input with a show/hide eye, used for PINs. */
export function SecretField({ show, onToggle, ...props }: { show: boolean; onToggle: () => void } & Record<string, any>) {
  return (
    <Field
      {...props}
      type={show ? 'text' : 'password'}
      right={
        <button type="button" className="icon-btn" style={{ width: 32, height: 32, fontSize: 20 }} onClick={onToggle} aria-label={show ? 'Hide' : 'Show'}>
          <Icon name={show ? 'eyeoff' : 'eye'} />
        </button>
      }
    />
  )
}

export function labelFor(seed: string): string {
  const s = (seed || '').trim()
  if (/^0x[0-9a-fA-F]+/.test(s)) return s.slice(2, 4).toUpperCase()
  const parts = s.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (s.slice(0, 2) || '··').toUpperCase()
}

export function Avatar({ seed, size = 44, dir }: { seed: string; size?: number; dir?: 'out' | 'in' }) {
  const badge = Math.round(size * 0.42)
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.34 }} aria-hidden="true">
      {labelFor(seed)}
      {dir && (
        <span className={`dir ${dir}`} style={{ width: badge, height: badge }}>
          <Icon name={dir === 'out' ? 'up' : 'down'} size={Math.round(badge * 0.62)} />
        </span>
      )}
    </div>
  )
}

export function QuickAction({ icon, label, to, primary, onClick }: { icon: IconName; label: string; to?: string; primary?: boolean; onClick?: () => void }) {
  const inner = (
    <>
      <span className={`tile ${primary ? 'primary' : ''}`}><Icon name={icon} /></span>
      <span>{label}</span>
    </>
  )
  return to ? <Link to={to} className="qa">{inner}</Link> : <button className="qa" onClick={onClick}>{inner}</button>
}

const STATUS_LABEL: Record<string, string> = { pending: 'Pending', relayed: 'Relayed', settled: 'Settled', failed: 'Failed' }
export function StatusDot({ status }: { status: 'pending' | 'relayed' | 'settled' | 'failed' | string }) {
  const key = ['pending', 'relayed', 'settled', 'failed'].includes(status) ? status : status === 'duplicate' || status === 'expired' || status === 'invalid' || status === 'cancelled' ? 'failed' : 'pending'
  const label = STATUS_LABEL[status] ?? status.charAt(0).toUpperCase() + status.slice(1)
  return <span className={`status s-${key}`}><i />{label}</span>
}

export function Sparkline({ points, width = 320, height = 44 }: { points: number[]; width?: number; height?: number }) {
  const gid = useId()
  if (!points || points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const stepX = width / (points.length - 1)
  const y = (v: number) => height - 6 - ((v - min) / span) * (height - 12)
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * stepX).toFixed(1)} ${y(p).toFixed(1)}`).join(' ')
  const area = `${line} L ${width} ${height} L 0 ${height} Z`
  return (
    <div className="spark" aria-hidden="true">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3ED9B8" stopOpacity="0.35" />
            <stop offset="1" stopColor="#3ED9B8" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke="#3ED9B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button role="switch" aria-checked={checked} aria-label={label} className="toggle" disabled={disabled} onClick={() => onChange(!checked)} />
}

/** Header for pushed screens: back / close on the left, title centred. */
export function ScreenHeader({ title, close, to }: { title?: string; close?: boolean; to?: string }) {
  const nav = useNavigate()
  const back = () => (to ? nav(to) : window.history.length > 1 ? nav(-1) : nav('/app'))
  return (
    <div className="screen-head">
      <button className="icon-btn" onClick={back} aria-label={close ? 'Close' : 'Back'}>
        <Icon name={close ? 'x' : 'left'} />
      </button>
      <h1>{title}</h1>
      <span style={{ width: 40 }} />
    </div>
  )
}

export function Row({ icon, label, value, to, onClick, control, external }: { icon: IconName; label: string; value?: string; to?: string; onClick?: () => void; control?: ReactNode; external?: string }) {
  const body = (
    <>
      <span className="ico"><Icon name={icon} /></span>
      <span className="lbl">{label}</span>
      {value && <span className="val ellipsis">{value}</span>}
      {control}
      {(to || onClick || external) && <Icon name={external ? 'external' : 'right'} className="muted" size={18} />}
    </>
  )
  if (to) return <Link to={to} className="group-row">{body}</Link>
  if (external) return <a href={external} target="_blank" rel="noreferrer noopener" className="group-row">{body}</a>
  if (onClick) return <button className="group-row" onClick={onClick}>{body}</button>
  return <div className="group-row">{body}</div>
}

export function DetailRow({ k, children }: { k: string; children: ReactNode }) {
  return <div className="drow"><span className="k">{k}</span><span className="v">{children}</span></div>
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row"><h2 className="grow" style={{ fontSize: 17 }}>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        {children}
      </div>
    </div>
  )
}

let toastTimer: ReturnType<typeof setTimeout> | undefined
const toastListeners = new Set<(m: string | null) => void>()
export function toast(message: string) {
  toastListeners.forEach((l) => l(message))
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastListeners.forEach((l) => l(null)), 3500)
}
export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    toastListeners.add(setMsg)
    return () => void toastListeners.delete(setMsg)
  }, [])
  return msg ? <div className="toast" role="status" aria-live="polite">{msg}</div> : null
}

/**
 * Copies text. Browsers only let a page read the clipboard back with explicit permission, so the auto-clear the
 * phone app does is best-effort here: it runs only if clipboard-read is already granted (it never prompts).
 */
export async function copyWithAutoClear(text: string, clearMs = 30_000): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    return false
  }
  setTimeout(async () => {
    try {
      const perm = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName })
      if (perm.state !== 'granted') return
      if ((await navigator.clipboard.readText()) === text) await navigator.clipboard.writeText('')
    } catch {
      /* cannot verify: leave as is */
    }
  }, clearMs)
  return true
}

export async function copyPlain(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Contact name if saved, otherwise a short address. */
export function getContactName(address: string): string {
  return getContact(address)?.name ?? shortAddr(address)
}
