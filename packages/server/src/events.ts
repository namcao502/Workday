import type { ServerEvent } from '@workday/core'

const SOCKET_OPEN = 1

export interface EventSocket {
  readonly readyState: number
  send(data: string): void
}

export interface EventSink {
  broadcast(event: ServerEvent): void
}

export class EventHub implements EventSink {
  private readonly sockets = new Set<EventSocket>()

  // Returns the function that removes the socket again (call it on close).
  add(socket: EventSocket): () => void {
    this.sockets.add(socket)
    return () => {
      this.sockets.delete(socket)
    }
  }

  broadcast(event: ServerEvent): void {
    const message = JSON.stringify(event)
    for (const socket of this.sockets) {
      if (socket.readyState === SOCKET_OPEN) {
        socket.send(message)
      }
    }
  }
}
