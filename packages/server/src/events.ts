import type { ServerEvent } from '@workday/core'

const SOCKET_OPEN = 1
const POLICY_VIOLATION = 1008

export interface EventSocket {
  readonly readyState: number
  send(data: string): void
  close(code?: number): void
}

export interface EventSink {
  broadcast(event: ServerEvent): void
}

export class EventHub implements EventSink {
  // The device each socket belongs to; null for a socket from this machine.
  private readonly sockets = new Map<EventSocket, string | null>()

  // Returns the function that removes the socket again (call it on close).
  add(socket: EventSocket, deviceId: string | null = null): () => void {
    this.sockets.set(socket, deviceId)
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
    this.closeWhere((socketDeviceId) => socketDeviceId === deviceId)
  }

  // Remote access was turned off: every device socket goes, the PC's own stay.
  closeAllDevices(): void {
    this.closeWhere((socketDeviceId) => socketDeviceId !== null)
  }

  private closeWhere(matches: (deviceId: string | null) => boolean): void {
    for (const [socket, socketDeviceId] of this.sockets) {
      if (matches(socketDeviceId)) {
        this.sockets.delete(socket)
        socket.close(POLICY_VIOLATION)
      }
    }
  }
}
