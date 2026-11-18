import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from '@/components/Icon'

export const APK_URL = 'https://github.com/Tevin-Isaac/wayamesh-mobile/releases/latest/download/wayamesh-beta.apk'
const REPO_URL = 'https://github.com/Tevin-Isaac/wayamesh-mobile'

const STEPS: { n: string; icon: IconName; title: string; body: string }[] = [
  { n: '01', icon: 'lock', title: 'Sign offline', body: 'Put USDC in your offline reserve while you are online. Later, with no connection at all, your device signs a payment with your own key. The amount and recipient are sealed by your signature.' },
  { n: '02', icon: 'qr', title: 'Hand it over', body: 'Show the receiver a QR code or share the code. On Android you can also hand it over by Bluetooth. They verify the signature on the spot, before they have any internet.' },
  { n: '03', icon: 'zap', title: 'Settle on Arc', body: 'The first device that goes online (the receiver, you, or anyone carrying it) submits the payment to Arc. The contract pays the receiver from your reserve and can tip the courier.' },
]

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'lock', title: 'Offline signing', body: 'Payments are EIP-712 vouchers against a MeshPayV2 reserve on Arc Testnet. Signing needs no network.' },
  { icon: 'qr', title: 'QR handoff on any device', body: 'A signed payment is 178 bytes and fits in one QR code. The web wallet and the phone app are being aligned on this same code so they can pay each other.' },
  { icon: 'bluetooth', title: 'Bluetooth handoff (Android)', body: 'The Android beta can hand a payment to a nearby phone over Bluetooth. Single hop, Android only today.' },
  { icon: 'key', title: 'Self-custody', body: 'Your key is generated on your device. The web wallet encrypts it with your PIN (AES-GCM) and never sends it anywhere. We cannot access or freeze your funds.' },
  { icon: 'users', title: 'Couriers and tips', body: 'Anyone can carry and settle a payment for someone else. The payer can include an optional tip that goes to whoever settles it.' },
  { icon: 'shield', title: 'Spending limits for agents', body: 'Give an agent a mandate with per-payment, daily and total limits and an allowlist. A fixed policy engine enforces them, not an AI.' },
  { icon: 'chat', title: 'Chat and pay', body: 'Add contacts and pay inside a conversation. Chat text stays on your device for now; payments are real.' },
  { icon: 'globe', title: 'Nine languages', body: 'English, Kiswahili, Hausa, Français, Português, Español, العربية, 한국어 and 中文 (translations are still being wired into every screen).' },
]

const LIMITS = [
  'Testnet only. Wayamesh runs on Arc Testnet with test USDC. Arc mainnet is not live yet, so nothing here holds real money.',
  'The receiver’s guarantee is settlement-based. Until a payment settles, treat it like a promise from a customer. If the payer’s reserve is drained first, it can fail. Locked collateral with fraud proofs is on the roadmap.',
  'Bluetooth handoff is Android-only and single-hop. Multi-hop relay and iOS are roadmap. QR handoff works on any two devices today. Browsers cannot do Bluetooth.',
  'Chat text is device-local. It does not leave your device yet.',
  'The Android app is a beta you install from an APK. It is not on the App Store or Google Play.',
  'On the web, a PIN is a convenience lock. Back up your seed phrase; it is the real recovery.',
]

const FAQ: { q: string; a: string }[] = [
  { q: 'Is my money safe without internet?', a: 'Your keys stay on your device and are never transmitted. Signing happens locally, and anyone can verify the signature offline. The honest caveat: the receiver is only fully protected once the payment settles on Arc.' },
  { q: 'Do you have access to my money?', a: 'No. Wayamesh is self-custodial. There is no account and no server holding your key. Only you control your funds.' },
  { q: 'What happens if I lose my phone or forget my PIN?', a: 'Your funds are on the blockchain, not on the device. Restore with the seed phrase you wrote down during setup. If you did not back it up, we cannot recover it for you.' },
  { q: 'Are there fees?', a: 'Signing offline is free. Settling on Arc costs a small network fee, paid in USDC (Arc uses USDC as its gas token) by whoever submits the payment. Payers can add an optional tip to encourage couriers.' },
  { q: 'Can the web wallet and the phone app pay each other?', a: 'Yes, that is the goal. Both use the same payment code and the same seed-phrase derivation, so one seed gives one address on both. The phone app is being updated to the shared payment code; until that ships, test cross-device payments between web wallets.' },
]

export function Landing() {
  useEffect(() => { document.title = 'Wayamesh: send USDC with no internet' }, [])
  return (
    <div className="lp">
      <a href="#main-content" className="skip">Skip to content</a>
      <header className="lp-nav">
        <Link to="/" className="lp-brand"><img src={`${import.meta.env.BASE_URL}mark.png`} alt="" width="32" height="32" /><span>wayamesh</span></Link>
        <nav aria-label="Site">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#limits">Limits</a>
          <a href="#faq">FAQ</a>
        </nav>
        <Link to="/app" className="lp-btn small">Open web wallet</Link>
      </header>

      <main id="main-content">
        <section className="lp-hero">
          <div className="lp-wrap">
            <p className="lp-eyebrow">Offline-first USDC · Arc Testnet</p>
            <h1>Send USDC with <span className="serif">no internet.</span></h1>
            <p className="lp-lead">
              Sign a payment on your device with no connection, hand it to the receiver by QR code, and the first device that goes online settles it on Arc.
              No bank, no signal, no account.
            </p>
            <div className="lp-cta">
              <a className="lp-btn" href={APK_URL}><Icon name="download" size={18} />Download Android beta</a>
              <Link className="lp-btn ghost" to="/app"><Icon name="wallet" size={18} />Open web wallet</Link>
            </div>
            <p className="lp-note">Android beta is a direct APK download (not on the Play Store). The web wallet runs in your browser. Testnet only.</p>
          </div>
        </section>

        <section className="lp-sec" id="problem">
          <div className="lp-wrap lp-two">
            <div className="lp-card"><h2>The problem</h2><p>When connectivity fails, whether from a shutdown, a storm or a dead zone, digital payments stop. People cannot pay each other even when they are standing in the same room.</p></div>
            <div className="lp-card"><h2>The idea</h2><p>A signed payment is just data. Wayamesh lets you sign it offline and pass it hand to hand. Whoever reaches the internet first settles it on Arc. Settlement is on-chain, final and public.</p></div>
          </div>
        </section>

        <section className="lp-sec" id="how">
          <div className="lp-wrap">
            <h2 className="lp-h2">How it works</h2>
            <p className="lp-sub">Three steps. Offline first.</p>
            <ol className="lp-steps">
              {STEPS.map((s) => (
                <li key={s.n} className="lp-card">
                  <span className="lp-n">{s.n}</span>
                  <Icon name={s.icon} size={26} />
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="lp-sec" id="features">
          <div className="lp-wrap">
            <h2 className="lp-h2">What works today</h2>
            <p className="lp-sub">Only things that are built and running on Arc Testnet.</p>
            <ul className="lp-grid">
              {FEATURES.map((f) => (
                <li key={f.title} className="lp-card">
                  <span className="lp-ico"><Icon name={f.icon} size={22} /></span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-sec" id="limits">
          <div className="lp-wrap">
            <h2 className="lp-h2">Honest limits</h2>
            <p className="lp-sub">What this beta does not do yet.</p>
            <ul className="lp-limits">
              {LIMITS.map((l) => <li key={l}><Icon name="warn" size={18} /><span>{l}</span></li>)}
            </ul>
          </div>
        </section>

        <section className="lp-sec" id="faq">
          <div className="lp-wrap lp-narrow">
            <h2 className="lp-h2">FAQ</h2>
            {FAQ.map((f) => (
              <details key={f.q} className="lp-faq">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="lp-sec lp-final">
          <div className="lp-wrap">
            <h2 className="lp-h2">Try it on testnet</h2>
            <p className="lp-sub">Create a wallet, grab free test USDC from Circle’s faucet, and send your first offline payment.</p>
            <div className="lp-cta">
              <Link className="lp-btn" to="/app"><Icon name="wallet" size={18} />Open web wallet</Link>
              <a className="lp-btn ghost" href={APK_URL}><Icon name="download" size={18} />Android beta</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <span>wayamesh · Offline-first USDC on Arc Testnet</span>
          <span><a href={REPO_URL} target="_blank" rel="noreferrer noopener">GitHub</a> · <Link to="/app">Web wallet</Link></span>
        </div>
      </footer>
    </div>
  )
}
