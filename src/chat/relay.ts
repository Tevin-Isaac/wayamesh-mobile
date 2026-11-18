/**
 * Connections to public Nostr relays (framework neutral; identical copies in src/chat and web/src/lib/chat).
 * Relays are untrusted mailboxes. Every message is sealed end to end and published under a throwaway key,
 * so a relay learns neither the text nor who wrote it. A relay may drop, delay or keep messages: nothing
 * here guarantees delivery, only "published to N relays".
 */
import { RELAY_KIND, relayEventValid, type RelayEvent } from './crypto'

export const DEFAULT_RELAYS = ['wss://nos.lol', 'wss://relay.primal.net', 'wss://relay.damus.io']

interface Conn {
  url: string
  ws: WebSocket | null
  open: boolean
  tries: number
  timer: ReturnType<typeof setTimeout> | null
  acks: Map<string, (ok: boolean) => void>
}

export type RelayHandler = (event: RelayEvent) => void
export interface RelayStatus {
  connected: number
  total: number
}

export class RelayPool {
  private conns = new Map<string, Conn>()
  private seen = new Set<string>()
  private handler: RelayHandler | null = null
  private filter: { x: string; since: number } | null = null
  private want = false
  private status: RelayStatus = { connected: 0, total: 0 }
  private listeners = new Set<() => void>()

  getStatus = (): RelayStatus => this.status

  subscribeStatus = (l: () => void): (() => void) => {
    this.listeners.add(l)
    return () => {
      this.listeners.delete(l)
    }
  }

  private emit() {
    const connected = [...this.conns.values()].filter((c) => c.open).length
    if (connected !== this.status.connected || this.conns.size !== this.status.total) {
      this.status = { connected, total: this.conns.size }
      this.listeners.forEach((l) => l())
    }
  }

  private sendReq(c: Conn) {
    if (!c.ws || !c.open || !this.filter) return
    c.ws.send(JSON.stringify(['REQ', 'wayamesh', { kinds: [RELAY_KIND], '#p': [this.filter.x], since: this.filter.since }]))
  }

  private connect(c: Conn) {
    if (!this.want || c.ws) return
    try {
      const ws = new WebSocket(c.url)
      c.ws = ws
      ws.onopen = () => {
        c.open = true
        c.tries = 0
        this.sendReq(c)
        this.emit()
      }
      ws.onmessage = (msg: { data: unknown }) => {
        try {
          const data = JSON.parse(String(msg.data)) as unknown[]
          if (data[0] === 'EVENT' && data[2]) {
            const e = data[2] as RelayEvent
            if (this.seen.has(e.id) || !relayEventValid(e)) return
            this.seen.add(e.id)
            this.handler?.(e)
          } else if (data[0] === 'OK' && typeof data[1] === 'string') {
            c.acks.get(data[1])?.(data[2] === true)
          }
        } catch {
          // ignore malformed frames
        }
      }
      const down = () => {
        if (c.ws !== ws) return
        c.open = false
        c.ws = null
        this.emit()
        if (this.want) {
          c.tries += 1
          c.timer = setTimeout(() => this.connect(c), Math.min(30_000, 1500 * 2 ** c.tries))
        }
      }
      ws.onclose = down
      ws.onerror = () => {
        try {
          ws.close()
        } catch {
          down()
        }
      }
    } catch {
      c.ws = null
    }
  }

  /** Connect and subscribe to events addressed to `x` (the x-only chat pubkey) newer than `since` (unix seconds). */
  start(urls: string[], x: string, since: number, onEvent: RelayHandler) {
    this.stop()
    this.want = true
    this.handler = onEvent
    this.filter = { x, since }
    for (const url of urls) {
      const c: Conn = { url, ws: null, open: false, tries: 0, timer: null, acks: new Map() }
      this.conns.set(url, c)
      this.connect(c)
    }
    this.emit()
  }

  stop() {
    this.want = false
    this.handler = null
    this.filter = null
    for (const c of this.conns.values()) {
      if (c.timer) clearTimeout(c.timer)
      try {
        c.ws?.close()
      } catch {
        /* already closed */
      }
      c.ws = null
      c.open = false
    }
    this.conns.clear()
    this.emit()
  }

  get active(): boolean {
    return this.want
  }

  /** Publishes to every open relay. Resolves with how many acknowledged it. 0 means nothing was sent. */
  async publish(event: RelayEvent, timeoutMs = 6000): Promise<number> {
    const open = [...this.conns.values()].filter((c) => c.open && c.ws)
    if (open.length === 0) return 0
    const acks = await Promise.all(
      open.map(
        (c) =>
          new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => {
              c.acks.delete(event.id)
              resolve(false)
            }, timeoutMs)
            c.acks.set(event.id, (ok) => {
              clearTimeout(timer)
              c.acks.delete(event.id)
              resolve(ok)
            })
            try {
              c.ws?.send(JSON.stringify(['EVENT', event]))
            } catch {
              clearTimeout(timer)
              resolve(false)
            }
          }),
      ),
    )
    return acks.filter(Boolean).length
  }
}
