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

export class EventHub implements EventSink {
  // The device and surface each socket belongs to; no device for a socket from this machine.
  private readonly sockets = new Map<
    EventSocket,
    { readonly deviceId: string | null; readonly surface: RemoteSurface }
  >()

  // Returns the function that removes the socket again (call it on close).
  add(
    socket: EventSocket,
    deviceId: string | null = null,
    surface: RemoteSurface = 'loopback',
  ): () => void {
    this.sockets.set(socket, { deviceId, surface })
    return () => {
      this.sockets.delete(socket)
    }
  }

  broadcast(event: ServerEvent): void {
    const message = JSON.stringify(event)
    for (const socket of this.sockets.keys()) {
      if (socket.readyState === SOCKET_OPEN) {
        socket.send(message)
      }
    }
  }

  // A revoked or downgraded device must reconnect, so the gate checks its new rights.
  closeDevice(deviceId: string): void {
    this.closeWhere((entry) => entry.deviceId === deviceId)
  }

  // A surface was turned off: its device sockets go, the PC's own stay. No surface = all of them.
  closeAllDevices(surface?: RemoteSurface): void {
    this.closeWhere(
      (entry) => entry.deviceId !== null && (surface === undefined || entry.surface === surface),
    )
  }

  private closeWhere(
    matches: (entry: { deviceId: string | null; surface: RemoteSurface }) => boolean,
  ): void {
    for (const [socket, entry] of this.sockets) {
      if (matches(entry)) {
        this.sockets.delete(socket)
        socket.close(POLICY_VIOLATION)
      }
    }
  }
}
