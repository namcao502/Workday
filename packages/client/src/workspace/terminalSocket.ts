import { isPlainCode, type PlainCode } from '../api/client.js'
import { isRecord } from '../json.js'

export type TerminalMessage =
  | { readonly type: 'output'; readonly data: string }
  | { readonly type: 'exited' }
  | { readonly type: 'error'; readonly code: PlainCode }

export type ClientTerminalMessage =
  | {
      readonly type: 'attach' | 'resize' | 'start'
      readonly columns: number
      readonly rows: number
    }
  | { readonly type: 'input'; readonly data: string }

export interface TerminalSocket {
  readonly send: (message: ClientTerminalMessage) => void
  readonly close: () => void
}

// Accepts the raw frame (a JSON string) or an already parsed value; anything else is null.
export function parseTerminalMessage(raw: unknown): TerminalMessage | null {
  let value: unknown = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!isRecord(value)) {
    return null
  }
  const { type, data, code } = value
  if (type === 'output' && typeof data === 'string') {
    return { type, data }
  }
  if (type === 'exited') {
    return { type }
  }
  if (type === 'error' && isPlainCode(code)) {
    return { type, code }
  }
  return null
}

interface TerminalHandlers {
  readonly onMessage: (message: TerminalMessage) => void
  readonly onClose: () => void
}

// Messages sent before the socket is open (the first attach) are queued and flushed on open.
export function openTerminalSocket(session: string, handlers: TerminalHandlers): TerminalSocket {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${scheme}//${window.location.host}/api/terminal/${encodeURIComponent(session)}`
  const socket = new WebSocket(url)
  const queued: string[] = []
  socket.onopen = () => {
    for (const text of queued.splice(0)) {
      socket.send(text)
    }
  }
  socket.onmessage = (event: MessageEvent) => {
    const message = parseTerminalMessage(event.data)
    if (message !== null) {
      handlers.onMessage(message)
    }
  }
  socket.onclose = handlers.onClose
  return {
    send: (message) => {
      const text = JSON.stringify(message)
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(text)
      } else if (socket.readyState === WebSocket.CONNECTING) {
        queued.push(text)
      }
    },
    close: () => {
      socket.onclose = null
      socket.close()
    },
  }
}
