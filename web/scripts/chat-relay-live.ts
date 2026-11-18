/**
 * Live check: two throwaway identities exchange a sealed message through public Nostr relays.
 * Run: npx vite-node scripts/chat-relay-live.ts   (needs outbound WebSocket access; no funds involved)
 */
import { generatePrivateKey } from 'viem/accounts'
import { RelayPool, DEFAULT_RELAYS } from '../src/lib/chat/relay'
import { buildInner, buildRelayEvent, chatPubkeyOf, deriveChatKey, fromB64Url, openMessage, sealMessage, xonlyOf, addressOfPubkey } from '../src/lib/chat/crypto'

const mk = () => {
  const pk = generatePrivateKey()
  const chat = deriveChatKey(pk)
  const pub = chatPubkeyOf(chat)
  return { chat, pub, address: addressOfPubkey(pub) } // address only needs to be consistent for this test
}
const a = mk(), b = mk()
const pool = new RelayPool()
const sender = new RelayPool()
const t0 = Date.now()
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`
const text = 'live test ' + Math.random().toString(36).slice(2)

const done = new Promise<void>((resolve) => {
  pool.start(DEFAULT_RELAYS, xonlyOf(b.pub), Math.floor(Date.now() / 1000) - 60, (e) => {
    try {
      const { inner } = openMessage(fromB64Url(e.content), b.chat, b.address)
      console.log(stamp(), 'received via relay:', JSON.stringify(inner.x), inner.x === text ? 'MATCH' : 'MISMATCH')
      resolve()
    } catch (err) {
      console.log(stamp(), 'event failed to open', String(err))
    }
  })
})
sender.start(DEFAULT_RELAYS, xonlyOf(a.pub), Math.floor(Date.now() / 1000), () => {})
await new Promise((r) => setTimeout(r, 4000))
console.log(stamp(), 'connected relays: subscriber', pool.getStatus().connected, '/ sender', sender.getStatus().connected)
const box = sealMessage(buildInner(a.chat, a.address, b.address, { k: 'text', x: text }), b.pub)
const acks = await sender.publish(buildRelayEvent(xonlyOf(b.pub), box))
console.log(stamp(), 'publish acknowledged by', acks, 'relay(s)')
const ok = await Promise.race([done.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 11000))])
console.log(ok ? 'RESULT: round trip OK' : 'RESULT: no message received within window')
pool.stop(); sender.stop()
process.exit(ok ? 0 : 1)
