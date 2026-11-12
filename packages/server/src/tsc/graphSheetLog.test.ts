import type { SheetError, SheetWrite, TscConfig } from '@workday/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GraphSheetLog, type TokenSource } from './graphSheetLog.js'

// 2026-01-05 is day 5 of the year, so with 2 header rows it sits on row 7.
const DATE = '2026-01-05'
const CONFIG: TscConfig = {
  shareUrl: 'https://share.example/file',
  worksheetPattern: 'Daily {year}',
  columns: ['M', 'J'],
  headerRows: 2,
  offMarker: 'OFF',
  offFillColor: '#FFFF00',
  tokenPages: [],
  driveId: 'D1',
  itemId: 'I1',
}

function jwt(expSeconds: number): string {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode({ exp: expSeconds })}.sig`
}

interface Recorded {
  readonly method: string
  readonly url: string
  readonly body: string | null
}

interface FakeGraph {
  readonly fetchFn: typeof fetch
  readonly calls: Recorded[]
  readonly cells: Map<string, string>
  failPatch: boolean
}

function fakeGraph(initial: Record<string, string>): FakeGraph {
  const cells = new Map(Object.entries(initial))
  const calls: Recorded[] = []
  const graph: FakeGraph = {
    calls,
    cells,
    failPatch: false,
    fetchFn: (input, init) => {
      const url = urlOf(input)
      const method = init?.method ?? 'GET'
      const body = typeof init?.body === 'string' ? init.body : null
      calls.push({ method, url, body })
      const address = /range\(address='([^']+)'\)/.exec(decodeURIComponent(url))?.[1] ?? ''
      if (url.endsWith('/createSession')) {
        return Promise.resolve(Response.json({ id: 'S1' }))
      }
      if (url.endsWith('/closeSession')) {
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      if (method === 'GET') {
        return Promise.resolve(Response.json({ text: [[cells.get(address) ?? '']] }))
      }
      if (method === 'PATCH' && url.endsWith('/format/fill')) {
        return Promise.resolve(new Response(null, { status: 200 }))
      }
      if (method === 'PATCH') {
        if (graph.failPatch) {
          return Promise.resolve(new Response('boom', { status: 500 }))
        }
        const parsed = JSON.parse(body ?? '{}') as { values: string[][] }
        cells.set(address, parsed.values[0]?.[0] ?? '')
        return Promise.resolve(Response.json({}))
      }
      return Promise.resolve(new Response(null, { status: 200 }))
    },
  }
  return graph
}

function fakeTokens(token = jwt(Math.floor(Date.now() / 1000) + 3600)): {
  readonly source: TokenSource
  readonly sniff: ReturnType<typeof vi.fn<TokenSource['sniff']>>
} {
  const sniff = vi.fn<TokenSource['sniff']>(() => Promise.resolve({ token }))
  const signIn = (): Promise<SheetWrite> => Promise.resolve({ ok: true })
  return {
    sniff,
    source: { sniff, signIn, checkSession: () => Promise.resolve({ signedIn: true }) },
  }
}

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') {
    return input
  }
  return input instanceof URL ? input.href : input.url
}

function methods(graph: FakeGraph, suffix: string): readonly string[] {
  return graph.calls.filter((c) => c.url.endsWith(suffix)).map((c) => c.method)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('GraphSheetLog writes', () => {
  it('writeTickets aborts on a column B date mismatch without writing', async () => {
    const graph = fakeGraph({ B7: '1/6/2026' })
    const log = new GraphSheetLog(CONFIG, fakeTokens().source, null, graph.fetchFn)
    const result = await log.writeTickets(DATE, 'ABC-1')
    expect(result).toMatchObject({ ok: false, failure: 'dateMismatch' })
    expect(graph.calls.some((c) => c.method === 'PATCH')).toBe(false)
    expect(methods(graph, '/closeSession')).toEqual(['POST'])
  })

  it('writeTickets aborts when column B is empty', async () => {
    const graph = fakeGraph({})
    const log = new GraphSheetLog(CONFIG, fakeTokens().source, null, graph.fetchFn)
    expect(await log.writeTickets(DATE, 'ABC-1')).toMatchObject({ failure: 'dateMismatch' })
  })

  it('writeTickets skips a cell that already holds the text', async () => {
    const graph = fakeGraph({ B7: '1/5/2026', M7: 'ABC-1', J7: 'old' })
    const log = new GraphSheetLog(CONFIG, fakeTokens().source, null, graph.fetchFn)
    expect(await log.writeTickets(DATE, 'ABC-1')).toEqual({ ok: true })
    expect(graph.calls.filter((c) => c.method === 'PATCH')).toHaveLength(1)
    expect(graph.cells.get('J7')).toBe('ABC-1')
  })

  it('writeTickets clears the fill when it overwrites the off marker', async () => {
    const graph = fakeGraph({ B7: '1/5/2026', M7: 'OFF', J7: '' })
    const log = new GraphSheetLog(CONFIG, fakeTokens().source, null, graph.fetchFn)
    await log.writeTickets(DATE, 'ABC-1')
    const cleared = graph.calls.filter((c) => c.url.endsWith('/format/fill/clear'))
    expect(cleared).toHaveLength(1)
    expect(decodeURIComponent(cleared[0]?.url ?? '')).toContain("address='M7'")
  })

  it('writeOff colours a cell that already holds the off marker', async () => {
    const graph = fakeGraph({ B7: '1/5/2026', M7: 'OFF', J7: 'ABC-1' })
    const log = new GraphSheetLog(CONFIG, fakeTokens().source, null, graph.fetchFn)
    expect(await log.writeOff(DATE)).toEqual({ ok: true })
    const fills = graph.calls.filter((c) => c.url.endsWith('/format/fill'))
    expect(fills).toHaveLength(2)
    expect(fills[0]?.body).toBe('{"color":"#FFFF00"}')
    const valueWrites = graph.calls.filter((c) => c.method === 'PATCH' && !c.url.endsWith('/fill'))
    expect(valueWrites).toHaveLength(1)
    expect(graph.cells.get('J7')).toBe('OFF')
  })

  it('the session is closed even when a write fails', async () => {
    const graph = fakeGraph({ B7: '1/5/2026' })
    graph.failPatch = true
    const log = new GraphSheetLog(CONFIG, fakeTokens().source, null, graph.fetchFn)
    const result = await log.writeTickets(DATE, 'ABC-1')
    expect(result).toMatchObject({ ok: false, failure: 'failed' })
    expect((result as SheetError).detail).toContain('write M7 -> 500: boom')
    expect(methods(graph, '/closeSession')).toEqual(['POST'])
  })

  it('resolves the drive item from the share url when no ids are configured', async () => {
    const calls: string[] = []
    const fetchFn: typeof fetch = (input) => {
      calls.push(urlOf(input))
      return Promise.resolve(Response.json({ id: 'ITEM', parentReference: { driveId: 'DRIVE' } }))
    }
    const config = { ...CONFIG, driveId: null, itemId: null }
    await new GraphSheetLog(config, fakeTokens().source, null, fetchFn).writeOff(DATE)
    expect(calls[0]).toMatch(/\/shares\/u![A-Za-z0-9_-]+\/driveItem$/)
    expect(calls[1]).toContain('/drives/DRIVE/items/ITEM/workbook/createSession')
  })
})

describe('GraphSheetLog reads', () => {
  it('readTickets leaves out a date whose column B does not match', async () => {
    // 2026-01-06 is on row 8 and mismatches; on 01-05 M7 is empty so J7 wins.
    const graph = fakeGraph({ B7: '1/5/2026', J7: 'ABC-2', B8: '9/9/2026', M8: 'X-1' })
    const log = new GraphSheetLog(CONFIG, fakeTokens().source, null, graph.fetchFn)
    const read = await log.readTickets([DATE, '2026-01-06'], { allowSniff: true })
    expect(read).toEqual({ kind: 'read', cells: { [DATE]: 'ABC-2' } })
    expect(methods(graph, '/createSession')).toHaveLength(1)
  })

  it('readTickets maps an all-empty row to null and reports a request failure', async () => {
    const graph = fakeGraph({ B7: '1/5/2026' })
    const log = new GraphSheetLog(CONFIG, fakeTokens().source, null, graph.fetchFn)
    expect(await log.readTickets([DATE], { allowSniff: true })).toEqual({
      kind: 'read',
      cells: { [DATE]: null },
    })
    const failing: typeof fetch = () => Promise.resolve(new Response('nope', { status: 403 }))
    const bad = new GraphSheetLog(CONFIG, fakeTokens().source, null, failing)
    expect(await bad.readTickets([DATE], { allowSniff: true })).toEqual({
      kind: 'failed',
      detail: 'createSession -> 403: nope',
    })
  })
})

describe('GraphSheetLog token', () => {
  it('a cached token is reused until two minutes before it expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-05T10:00:00Z'))
    const tokens = fakeTokens(jwt(Math.floor(Date.now() / 1000) + 600))
    const log = new GraphSheetLog(
      CONFIG,
      tokens.source,
      null,
      fakeGraph({ B7: '1/5/2026' }).fetchFn,
    )
    await log.writeOff(DATE)
    vi.setSystemTime(new Date('2026-01-05T10:07:00Z'))
    await log.writeOff(DATE)
    expect(tokens.sniff).toHaveBeenCalledTimes(1)
    vi.setSystemTime(new Date('2026-01-05T10:08:30Z'))
    await log.writeOff(DATE)
    expect(tokens.sniff).toHaveBeenCalledTimes(2)
  })

  it('an opaque token lives 30 minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-05T10:00:00Z'))
    const tokens = fakeTokens('opaque')
    const log = new GraphSheetLog(
      CONFIG,
      tokens.source,
      null,
      fakeGraph({ B7: '1/5/2026' }).fetchFn,
    )
    await log.writeOff(DATE)
    vi.setSystemTime(new Date('2026-01-05T10:27:00Z'))
    await log.writeOff(DATE)
    expect(tokens.sniff).toHaveBeenCalledTimes(1)
    vi.setSystemTime(new Date('2026-01-05T10:29:00Z'))
    await log.writeOff(DATE)
    expect(tokens.sniff).toHaveBeenCalledTimes(2)
  })

  it('two writes at once sniff once', async () => {
    const tokens = fakeTokens()
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    tokens.sniff.mockImplementation(async () => {
      await gate
      return { token: jwt(Math.floor(Date.now() / 1000) + 3600) }
    })
    const log = new GraphSheetLog(
      CONFIG,
      tokens.source,
      null,
      fakeGraph({ B7: '1/5/2026' }).fetchFn,
    )
    const both = Promise.all([log.writeOff(DATE), log.writeTickets(DATE, 'ABC-1')])
    release()
    await both
    expect(tokens.sniff).toHaveBeenCalledTimes(1)
  })

  it('readTickets without sniff returns noToken when nothing is cached', async () => {
    const tokens = fakeTokens()
    const log = new GraphSheetLog(CONFIG, tokens.source, null, fakeGraph({}).fetchFn)
    expect(await log.readTickets([DATE], { allowSniff: false })).toEqual({ kind: 'noToken' })
    expect(tokens.sniff).not.toHaveBeenCalled()
  })

  it('readTickets without sniff does not wait for a running sniff', async () => {
    const tokens = fakeTokens()
    tokens.sniff.mockImplementation(() => new Promise(() => undefined))
    const log = new GraphSheetLog(CONFIG, tokens.source, null, fakeGraph({}).fetchFn)
    void log.writeOff(DATE)
    expect(await log.readTickets([DATE], { allowSniff: false })).toEqual({ kind: 'noToken' })
  })

  it('readTickets without sniff reuses a cached token', async () => {
    const tokens = fakeTokens()
    const log = new GraphSheetLog(
      CONFIG,
      tokens.source,
      null,
      fakeGraph({ B7: '1/5/2026' }).fetchFn,
    )
    await log.writeOff(DATE)
    const read = await log.readTickets([DATE], { allowSniff: false })
    expect(read.kind).toBe('read')
    expect(tokens.sniff).toHaveBeenCalledTimes(1)
  })

  it('the override token is used without sniffing', async () => {
    const tokens = fakeTokens()
    const seen: string[] = []
    const graph = fakeGraph({ B7: '1/5/2026' })
    const spy: typeof fetch = (input, init) => {
      seen.push(new Headers(init?.headers).get('authorization') ?? '')
      return graph.fetchFn(input, init)
    }
    await new GraphSheetLog(CONFIG, tokens.source, 'env-token', spy).writeOff(DATE)
    expect(tokens.sniff).not.toHaveBeenCalled()
    expect(new Set(seen)).toEqual(new Set(['Bearer env-token']))
  })

  it('signIn clears the cache so the next call sniffs again', async () => {
    const tokens = fakeTokens()
    const log = new GraphSheetLog(
      CONFIG,
      tokens.source,
      null,
      fakeGraph({ B7: '1/5/2026' }).fetchFn,
    )
    await log.writeOff(DATE)
    await log.signIn()
    await log.writeOff(DATE)
    expect(tokens.sniff).toHaveBeenCalledTimes(2)
  })

  it('a sniff error comes back as the write failure', async () => {
    const tokens = fakeTokens()
    tokens.sniff.mockResolvedValue({ failure: 'chromeMissing', detail: 'no chrome' })
    const log = new GraphSheetLog(CONFIG, tokens.source, null, fakeGraph({}).fetchFn)
    expect(await log.writeOff(DATE)).toEqual({
      ok: false,
      failure: 'chromeMissing',
      detail: 'no chrome',
    })
    expect(await log.readTickets([DATE], { allowSniff: true })).toEqual({
      kind: 'failed',
      detail: 'no chrome',
    })
  })
})
