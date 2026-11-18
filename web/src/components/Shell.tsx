import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '@/lib/session'
import { useT } from '@/lib/i18n'
import { Icon, type IconName } from './Icon'
import { Toaster } from './ui'
import { useChatRelay } from '@/lib/chat/service'

const TABS: { to: string; key: string; fallback: string; icon: IconName; end?: boolean }[] = [
  { to: '/app', key: 'wallet.title', fallback: 'Wallet', icon: 'wallet', end: true },
  { to: '/app/chat', key: 'chat.title', fallback: 'Chats', icon: 'chat' },
  { to: '/app/history', key: 'history.title', fallback: 'History', icon: 'time' },
  { to: '/app/mesh', key: 'mesh.title', fallback: 'Mesh', icon: 'wifi' },
  { to: '/app/settings', key: 'settings.title', fallback: 'Settings', icon: 'settings' },
]

const TAB_PATHS = new Set(TABS.map((t) => t.to))

/** Gate: only an unlocked wallet sees the app. Tabs on mobile widths, a left sidebar on desktop. */
export function Shell() {
  const s = useSession()
  const loc = useLocation()
  const { t } = useT()
  useChatRelay() // chat relay subscription while unlocked
  if (s.status === 'none') return <Navigate to="/app/onboarding" replace />
  if (s.status === 'pending') return <Navigate to="/app/pin-setup" replace />
  if (s.status === 'locked') return <Navigate to="/app/unlock" replace />

  const path = loc.pathname.replace(/\/+$/, '') || '/app'
  const bare = loc.search.includes('first=1')
  const isStack = !TAB_PATHS.has(path)
  const links = (cls: string) =>
    TABS.map((tab) => (
      <NavLink key={tab.to} to={tab.to} end={tab.end} className={cls}>
        <Icon name={tab.icon} />
        <span>{t(tab.key, tab.fallback)}</span>
      </NavLink>
    ))

  if (bare) return <div className="shell is-stack"><main className="shell-main" id="main"><Outlet /></main><Toaster /></div>

  return (
    <div className={`shell ${isStack ? 'is-stack' : ''}`}>
      <aside className="sidebar" aria-label="Sidebar">
        <div className="brand"><img src={`${import.meta.env.BASE_URL}mark.png`} alt="" /><span>WAYAMESH</span></div>
        <nav aria-label="Main" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{links('side-link')}</nav>
        <div className="side-spacer" />
        <a href="/" className="side-link"><Icon name="globe" /><span>Website</span></a>
        <div className="side-foot">Arc Testnet · web wallet beta</div>
      </aside>
      <main className="shell-main" id="main"><Outlet /></main>
      <nav className="tabbar" aria-label="Main tabs">{links('tab')}</nav>
      <Toaster />
    </div>
  )
}
