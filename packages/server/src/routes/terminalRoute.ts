import type { FastifyInstance } from 'fastify'
import type { WebSocket } from 'ws'
import { isRecord } from '../jsonFile.js'
import { isAllowedOrigin } from '../security/allowedHosts.js'
import { WorkspaceStartError } from '../workspace/pty.js'
import type { SessionHost } from '../workspace/sessionHost.js'
import type { WorkspaceService } from '../workspace/workspaceService.js'

const MIN_SIZE = 2
const MAX_SIZE = 1000
const ESCAPE = '\x1b'
const SOCKET_OPEN = 1
const INTERNAL_ERROR = 1011

type ClientMessage =
  | {
      readonly type: 'attach' | 'resize' | 'start'
      readonly columns: number
      readonly rows: number
    }
  | { readonly type: 'input'; readonly data: string }

function isSize(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= MIN_SIZE && value <= MAX_SIZE
  )
}

// Null for anything malformed, including a size outside 2..1000; the message is then dropped.
function parseMessage(raw: string): ClientMessage | null {
  let message: unknown
  try {
    message = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(message)) {
    return null
  }
  const { type, columns, rows, data } = message
  if (type === 'input') {
    return typeof data === 'string' ? { type, data } : null
  }
  const isSized = type === 'attach' || type === 'resize' || type === 'start'
  return isSized && isSize(columns) && isSize(rows) ? { type, columns, rows } : null
}

export interface TerminalRouteOptions {
  readonly logError?: (message: string, error: unknown) => void
}

export function registerTerminalRoute(
  app: FastifyInstance,
  workspace: WorkspaceService,
  allowedHosts: ReadonlySet<string>,
  options: TerminalRouteOptions = {},
): void {
  const logError = options.logError ?? console.error
  app.get<{ Params: { session: string } }>(
    '/api/terminal/:session',
    {
      websocket: true,
      // Local-only (no config.access); a page on another site must not drive a terminal.
      preValidation: async (request, reply) => {
        const { origin } = request.headers
        if (origin !== undefined && !isAllowedOrigin(origin, allowedHosts)) {
          return reply.code(403).send({ error: 'Forbidden origin' })
        }
        return undefined
      },
    },
    (socket, request) => {
      const name = request.params.session
      const send = (message: object): void => {
        if (socket.readyState === SOCKET_OPEN) {
          socket.send(JSON.stringify(message))
        }
      }
      const host = workspace.host(name)
      if (host === null) {
        // Answers the first message: a send and close inside the upgrade can be lost before the client is wired up.
        socket.once('message', () => {
          send({ type: 'error', code: 'sessionNotFound' })
          socket.close()
        })
        return
      }
      const start = (columns: number, rows: number): void => {
        try {
          host.start(columns, rows)
        } catch (error: unknown) {
          if (error instanceof WorkspaceStartError) {
            send({ type: 'error', code: error.code })
            return
          }
          logError(`Starting session ${name} failed`, error)
          socket.close(INTERNAL_ERROR)
        }
      }
      const session = new TerminalSocket(host, workspace, name, send, start)
      socket.on('message', (raw: WebSocket.RawData) => {
        const message = parseMessage(rawText(raw))
        if (message !== null) {
          session.handle(message)
        }
      })
      socket.on('close', () => {
        session.detach()
      })
    },
  )
}

function rawText(raw: WebSocket.RawData): string {
  if (Array.isArray(raw)) {
    return Buffer.concat(raw).toString('utf8')
  }
  return Buffer.from(raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw).toString('utf8')
}

class TerminalSocket {
  private detachHost: (() => void) | null = null

  constructor(
    private readonly host: SessionHost,
    private readonly workspace: WorkspaceService,
    private readonly name: string,
    private readonly send: (message: object) => void,
    private readonly start: (columns: number, rows: number) => void,
  ) {}

  handle(message: ClientMessage): void {
    switch (message.type) {
      case 'attach':
        this.attach(message.columns, message.rows)
        return
      case 'input':
        // A lone Esc closes claude's dialog without a hook, so the wait is cleared here.
        if (message.data === ESCAPE) {
          this.workspace.escape(this.name)
        }
        this.host.write(message.data)
        return
      case 'resize':
        this.host.resize(message.columns, message.rows)
        return
      case 'start':
        if (!this.host.running) {
          this.start(message.columns, message.rows)
        }
    }
  }

  detach(): void {
    this.detachHost?.()
    this.detachHost = null
  }

  private attach(columns: number, rows: number): void {
    if (this.detachHost !== null) {
      return
    }
    const { replay, detach } = this.host.attach(
      (data) => {
        this.send({ type: 'output', data })
      },
      () => {
        this.send({ type: 'exited' })
      },
    )
    this.detachHost = detach
    if (replay !== '') {
      this.send({ type: 'output', data: replay })
    }
    if (this.host.running) {
      this.host.resize(columns, rows)
    } else {
      this.start(columns, rows)
    }
  }
}
