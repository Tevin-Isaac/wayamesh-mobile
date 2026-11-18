import { Route, Routes, Navigate } from 'react-router-dom'
import { Shell } from './components/Shell'
import { Backup, ImportWallet, Onboarding, PinSetup, Restore, Unlock } from './screens/Auth'
import { Wallet } from './screens/Wallet'
import { Chats, ChatThread } from './screens/Chat'
import { History, Mesh, Reserve } from './screens/Activity'
import { Settings } from './screens/Settings'
import { Confirm, Send } from './screens/Send'
import { PaymentQr, Receive, ReceivePayment, Scan } from './screens/Receive'
import { Agent, AgentChat, Unavailable } from './screens/Agent'
import { Ramp } from './screens/Ramp'
import { useAutoSettle } from './lib/autoSettle'

function AutoSettle() {
  useAutoSettle()
  return null
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="/app/onboarding" element={<Onboarding />} />
        <Route path="/app/import" element={<ImportWallet />} />
        <Route path="/app/restore" element={<Restore />} />
        <Route path="/app/pin-setup" element={<PinSetup />} />
        <Route path="/app/unlock" element={<Unlock />} />
        <Route path="/app" element={<Shell />}>
          <Route index element={<Wallet />} />
          <Route path="chat" element={<Chats />} />
          <Route path="chat/:peer" element={<ChatThread />} />
          <Route path="history" element={<History />} />
          <Route path="mesh" element={<Mesh />} />
          <Route path="settings" element={<Settings />} />
          <Route path="send" element={<Send />} />
          <Route path="confirm" element={<Confirm />} />
          <Route path="receive" element={<Receive />} />
          <Route path="receive-payment" element={<ReceivePayment />} />
          <Route path="payment/:id" element={<PaymentQr />} />
          <Route path="scan" element={<Scan />} />
          <Route path="reserve" element={<Reserve />} />
          <Route path="ramp" element={<Ramp />} />
          <Route path="agent" element={<Agent />} />
          <Route path="agent-chat" element={<AgentChat />} />
          <Route path="backup" element={<Backup />} />
          <Route
            path="smart-account"
            element={<Unavailable title="Smart account" heading="Phone app only (beta)" body="The gasless smart account is a beta in the Android app. On Arc, gas is already paid in USDC, so this web wallet's normal address pays network fees in USDC without a smart account." />}
          />
          <Route
            path="guardian"
            element={<Unavailable title="Guardian recovery" heading="Phone app only" body="Splitting your key into guardian shards (2 of 3) is available in the Android app and is not built on the web yet. On the web, back up your 12-word seed phrase from Settings → Recovery phrase, and keep an encrypted backup file." />}
          />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
      <AutoSettle />
    </>
  )
}
