import {
  cellsForDate,
  dateLabelsMatch,
  expectedDateLabel,
  rowForDate,
  worksheetFor,
  type SheetError,
  type SheetLog,
  type SheetRead,
  type SheetWrite,
  type TscConfig,
} from '@workday/core'
import { GraphWorkbook } from './graphWorkbook.js'
import { jwtExpiry } from './jwt.js'

const SAFETY_BUFFER_MILLISECONDS = 2 * 60_000
const OPAQUE_TOKEN_LIFETIME_MILLISECONDS = 30 * 60_000

// GraphSheetLog's seam for the browser; the tests pass a fake.
export interface TokenSource {
  sniff(): Promise<{ readonly token: string } | SheetError> // headless
  checkSession(): Promise<{ readonly signedIn: boolean } | SheetError> // headless
  signIn(): Promise<SheetWrite> // visible browser
}

interface CachedToken {
  readonly token: string
  readonly expiresAtMilliseconds: number
}

const NO_TOKEN: SheetError = { failure: 'noToken', detail: '' }

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isTokenResult(
  value: { readonly token: string } | SheetError,
): value is { readonly token: string } {
  return 'token' in value
}

// The TSC workbook over Microsoft Graph. A token is never logged or put into a detail.
export class GraphSheetLog implements SheetLog {
  private cached: CachedToken | null = null
  private sniffing: Promise<string | SheetError> | null = null

  constructor(
    private readonly config: TscConfig,
    private readonly tokens: TokenSource,
    private readonly override: string | null,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  writeTickets(date: string, text: string): Promise<SheetWrite> {
    return this.write(date, async (workbook, sheet, cells) => {
      for (const cell of cells) {
        const current = await workbook.readCell(sheet, cell)
        if (current === text) {
          continue
        }
        await workbook.writeCell(sheet, cell, text)
        // Real work replacing an OFF marker must lose the fill with it.
        if (current === this.config.offMarker) {
          await workbook.clearFill(sheet, cell)
        }
      }
    })
  }

  writeOff(date: string): Promise<SheetWrite> {
    return this.write(date, async (workbook, sheet, cells) => {
      for (const cell of cells) {
        if ((await workbook.readCell(sheet, cell)) !== this.config.offMarker) {
          await workbook.writeCell(sheet, cell, this.config.offMarker)
        }
        // Outside the guard on purpose: a hand-typed OFF gets coloured too.
        await workbook.setFill(sheet, cell, this.config.offFillColor)
      }
    })
  }

  async readTickets(
    dates: readonly string[],
    options: { readonly allowSniff: boolean },
  ): Promise<SheetRead> {
    const token = await this.acquireToken(options.allowSniff)
    if (typeof token !== 'string') {
      return token.failure === 'noToken'
        ? { kind: 'noToken' }
        : { kind: 'failed', detail: token.detail }
    }
    try {
      const cells: Record<string, string | null> = {}
      await this.inSession(token, async (workbook) => {
        for (const date of dates) {
          const sheet = worksheetFor(date, this.config.worksheetPattern)
          if ((await this.dateMismatch(workbook, sheet, date)) !== null) {
            continue
          }
          cells[date] = await this.firstFilled(workbook, sheet, date)
        }
      })
      return { kind: 'read', cells }
    } catch (error: unknown) {
      return { kind: 'failed', detail: messageOf(error) }
    }
  }

  checkSession(): Promise<{ readonly signedIn: boolean } | SheetError> {
    return this.tokens.checkSession()
  }

  async signIn(): Promise<SheetWrite> {
    const result = await this.tokens.signIn()
    if (result.ok) {
      this.cached = null
    }
    return result
  }

  // Aborts with dateMismatch before any cell is touched when column B is not the expected date.
  private async write(
    date: string,
    apply: (workbook: GraphWorkbook, sheet: string, cells: readonly string[]) => Promise<void>,
  ): Promise<SheetWrite> {
    const token = await this.acquireToken(true)
    if (typeof token !== 'string') {
      return { ok: false, ...token }
    }
    try {
      const sheet = worksheetFor(date, this.config.worksheetPattern)
      const cells = cellsForDate(date, this.config.columns, this.config.headerRows)
      return await this.inSession(token, async (workbook) => {
        const mismatch = await this.dateMismatch(workbook, sheet, date)
        if (mismatch !== null) {
          return { ok: false, failure: 'dateMismatch', detail: mismatch } as const
        }
        await apply(workbook, sheet, cells)
        return { ok: true } as const
      })
    } catch (error: unknown) {
      return { ok: false, failure: 'failed', detail: messageOf(error) }
    }
  }

  private async inSession<Result>(
    token: string,
    use: (workbook: GraphWorkbook) => Promise<Result>,
  ): Promise<Result> {
    const ref = await GraphWorkbook.resolve(
      token,
      this.fetchFn,
      this.config.shareUrl,
      this.config.driveId,
      this.config.itemId,
    )
    const workbook = new GraphWorkbook(token, this.fetchFn, ref)
    await workbook.open()
    try {
      return await use(workbook)
    } finally {
      await workbook.close()
    }
  }

  // Null when column B of the date's row shows the date; otherwise why not.
  private async dateMismatch(
    workbook: GraphWorkbook,
    sheet: string,
    date: string,
  ): Promise<string | null> {
    const address = `B${String(rowForDate(date, this.config.headerRows))}`
    const expected = expectedDateLabel(date)
    const read = await workbook.readCell(sheet, address)
    if (dateLabelsMatch(read, expected)) {
      return null
    }
    const why =
      read === ''
        ? `Date check could not read ${address} (empty).`
        : `Date check failed: ${address} shows "${read}", expected "${expected}".`
    return `${why} Aborting to avoid wrong-day logging.`
  }

  private async firstFilled(
    workbook: GraphWorkbook,
    sheet: string,
    date: string,
  ): Promise<string | null> {
    for (const cell of cellsForDate(date, this.config.columns, this.config.headerRows)) {
      const value = await workbook.readCell(sheet, cell)
      if (value !== '') {
        return value
      }
    }
    return null
  }

  private acquireToken(allowSniff: boolean): Promise<string | SheetError> {
    if (this.override !== null && this.override !== '') {
      return Promise.resolve(this.override)
    }
    const cached = this.cachedToken()
    if (cached !== null) {
      return Promise.resolve(cached)
    }
    if (!allowSniff) {
      return Promise.resolve(NO_TOKEN)
    }
    // One shared promise: concurrent callers wait for the same sniff, so Chrome opens once.
    this.sniffing ??= this.sniffToken().finally(() => {
      this.sniffing = null
    })
    return this.sniffing
  }

  private cachedToken(): string | null {
    const cached = this.cached
    if (
      cached === null ||
      Date.now() >= cached.expiresAtMilliseconds - SAFETY_BUFFER_MILLISECONDS
    ) {
      return null
    }
    return cached.token
  }

  private async sniffToken(): Promise<string | SheetError> {
    const result = await this.tokens.sniff()
    if (!isTokenResult(result)) {
      return result
    }
    const expiry = jwtExpiry(result.token)
    this.cached = {
      token: result.token,
      expiresAtMilliseconds: expiry?.getTime() ?? Date.now() + OPAQUE_TOKEN_LIFETIME_MILLISECONDS,
    }
    return result.token
  }
}
