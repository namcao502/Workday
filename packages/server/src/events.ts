import type { ServerEvent } from '@workday/core'

const SOCKET_OPEN = 1
const POLICY_VIOLATION = 1008

export type RemoteSurface = 'loopback' | 'vpn'

export interface EventSocket {
  readonly readyState: number
  send(data: string): void
  close(code?: number): void
}

export interface EventSink {
  broadcast(event: ServerEvent): void
}

export type ClientKind = 'app' | 'web'

interface SocketEntry {
  readonly deviceId: string | null
  readonly surface: RemoteSurface
  readonly client: ClientKind | null
}

export class EventHub implements EventSink {
  // The device, surface and declared client kind each socket belongs to; no device for a socket from this machine.
  private readonly sockets = new Map<EventSocket, SocketEntry>()

  // One local screen: the app wins, else the newest web tab; remote sockets are free. Returns the remover.
  add(
    socket: EventSocket,
    deviceId: string | null = null,
    surface: RemoteSurface = 'loopback',
    client: ClientKind | null = null,
  ): () => void {
    const kind = deviceId === null ? client : null
    if (kind === 'web' && this.hasLocalApp()) {
      this.release(socket, 'session.takenByApp')
      return () => undefined
    }
    if (kind !== null) {
      this.releaseLocalWebs(kind === 'app' ? 'session.takenByApp' : 'session.takenByTab')
    }
    this.sockets.set(socket, { deviceId, surface, client: kind })
    return () => {
      this.sockets.delete(socket)
    }
  }

  hasLocalApp(): boolean {
    return [...this.sockets.values()].some((entry) => entry.client === 'app')
  }

  private releaseLocalWebs(type: 'session.takenByApp' | 'session.takenByTab'): void {
    for (const [socket, entry] of [...this.sockets]) {
      if (entry.client === 'web') {
        this.sockets.delete(socket)
        this.release(socket, type)
      }
    }
  }

  // The client reads the event, not the close code.
  private release(socket: EventSocket, type: 'session.takenByApp' | 'session.takenByTab'): void {
    if (socket.readyState === SOCKET_OPEN) {
      socket.send(JSON.stringify({ type }))
    }
    socket.close(POLICY_VIOLATION)
  }

  broadcast(event: ServerEvent): void {
    const message = JSON.stringify(event)
    for (const socket of this.sockets.keys()) {
      if (socket.readyState === SOCKET_OPEN) {
        socket.send(message)
      }
    }
  }

  // A revoked device is disconnected so it cannot keep an open socket.
  closeDevice(deviceId: string): void {
    this.closeWhere((entry) => entry.deviceId === deviceId)
  }

  // A surface was turned off: its device sockets go, the PC's own stay. No surface = all of them.
  closeAllDevices(surface?: RemoteSurface): void {
    this.closeWhere(
      (entry) => entry.deviceId !== null && (surface === undefined || entry.surface === surface),
    )
  }

  private closeWhere(matches: (entry: SocketEntry) => boolean): void {
    for (const [socket, entry] of this.sockets) {
      if (matches(entry)) {
        this.sockets.delete(socket)
        socket.close(POLICY_VIOLATION)
      }
    }
  }
}
