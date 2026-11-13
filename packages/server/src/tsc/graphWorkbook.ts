import { retryTransient } from '../retry.js'

const GRAPH = 'https://graph.microsoft.com/v1.0'
const REQUEST_TIMEOUT_MILLISECONDS = 30_000
const ERROR_BODY_LENGTH = 300

export interface DriveItemRef {
  readonly driveId: string
  readonly itemId: string
}

// Message is "<what> -> <status>: <body start>"; it never carries the token.
export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message)
  }
}

// Graph shares id: base64url of the URL, no padding, "u!" prefix.
export function encodeShareId(url: string): string {
  return `u!${Buffer.from(url, 'utf8').toString('base64url')}`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function firstCell(root: Record<string, unknown>, property: string): string | null {
  const rows = root[property]
  const row = Array.isArray(rows) ? (rows[0] as unknown) : null
  const cell = Array.isArray(row) ? (row[0] as unknown) : null
  if (cell === null || cell === undefined) {
    return null
  }
  if (typeof cell === 'string') {
    return cell
  }
  return typeof cell === 'number' || typeof cell === 'boolean' ? String(cell) : null
}

// One Graph connection: a token, the fetch to use, and the workbook session once opened.
export class GraphWorkbook {
  private sessionId: string | null = null

  constructor(
    private readonly token: string,
    private readonly fetchFn: typeof fetch,
    private readonly ref: DriveItemRef,
  ) {}

  static async resolve(
    token: string,
    fetchFn: typeof fetch,
    shareUrl: string,
    driveId: string | null,
    itemId: string | null,
  ): Promise<DriveItemRef> {
    if (driveId !== null && itemId !== null) {
      return { driveId, itemId }
    }
    const url = `${GRAPH}/shares/${encodeShareId(shareUrl)}/driveItem`
    const json = await retryTransient(() =>
      sendJson(fetchFn, token, 'GET', url, null, null, 'shares/driveItem'),
    )
    const root = asRecord(json)
    const parent = asRecord(root?.parentReference)
    const id = root?.id
    const drive = parent?.driveId
    if (typeof id !== 'string' || typeof drive !== 'string' || id === '' || drive === '') {
      throw new GraphError('shares/driveItem: response missing driveId/itemId')
    }
    return { driveId: drive, itemId: id }
  }

  // persistChanges so PATCHes commit to the shared file; a retry that opens a second one is harmless.
  async open(): Promise<void> {
    const json = await retryTransient(() =>
      sendJson(
        this.fetchFn,
        this.token,
        'POST',
        `${this.base()}/createSession`,
        null,
        {
          persistChanges: true,
        },
        'createSession',
      ),
    )
    const id = asRecord(json)?.id
    if (typeof id !== 'string' || id === '') {
      throw new GraphError('createSession: response missing session id')
    }
    this.sessionId = id
  }

  // Best effort: the session expires on its own if this fails.
  async close(): Promise<void> {
    if (this.sessionId === null) {
      return
    }
    try {
      await sendJson(
        this.fetchFn,
        this.token,
        'POST',
        `${this.base()}/closeSession`,
        this.sessionId,
        null,
        'closeSession',
      )
    } catch {
      // ignored on purpose
    }
  }

  async readCell(sheet: string, address: string): Promise<string> {
    const url = this.rangeUrl(sheet, address)
    const json = await retryTransient(() =>
      sendJson(this.fetchFn, this.token, 'GET', url, this.sessionId, null, `read ${address}`),
    )
    const root = asRecord(json)
    return (
      root === null ? '' : (firstCell(root, 'text') ?? firstCell(root, 'values') ?? '')
    ).trim()
  }

  async writeCell(sheet: string, address: string, value: string): Promise<void> {
    const url = this.rangeUrl(sheet, address)
    await retryTransient(() =>
      sendJson(
        this.fetchFn,
        this.token,
        'PATCH',
        url,
        this.sessionId,
        { values: [[value]] },
        `write ${address}`,
      ),
    )
  }

  async setFill(sheet: string, address: string, color: string): Promise<void> {
    const url = `${this.rangeUrl(sheet, address)}/format/fill`
    await retryTransient(() =>
      sendJson(
        this.fetchFn,
        this.token,
        'PATCH',
        url,
        this.sessionId,
        { color },
        `fill ${address}`,
      ),
    )
  }

  // Best effort: a leftover fill is cosmetic and must not fail the write.
  async clearFill(sheet: string, address: string): Promise<void> {
    try {
      const url = `${this.rangeUrl(sheet, address)}/format/fill/clear`
      await sendJson(
        this.fetchFn,
        this.token,
        'POST',
        url,
        this.sessionId,
        null,
        `clear fill ${address}`,
      )
    } catch {
      // ignored on purpose
    }
  }

  private base(): string {
    return `${GRAPH}/drives/${this.ref.driveId}/items/${this.ref.itemId}/workbook`
  }

  private rangeUrl(sheet: string, address: string): string {
    const name = encodeURIComponent(sheet)
    const range = encodeURIComponent(address)
    return `${this.base()}/worksheets('${name}')/range(address='${range}')`
  }
}

async function sendJson(
  fetchFn: typeof fetch,
  token: string,
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  sessionId: string | null,
  body: object | null,
  what: string,
): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  }
  if (sessionId !== null) {
    headers['workbook-session-id'] = sessionId
  }
  if (body !== null) {
    headers['Content-Type'] = 'application/json'
  }
  const init: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
  }
  if (body !== null) {
    init.body = JSON.stringify(body)
  }
  const response = await fetchFn(url, init)
  const text = await response.text()
  if (!response.ok) {
    throw new GraphError(
      `${what} -> ${String(response.status)}: ${text.slice(0, ERROR_BODY_LENGTH)}`,
      response.status,
    )
  }
  if (text === '') {
    return null
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}
