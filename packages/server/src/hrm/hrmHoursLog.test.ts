import type { HrmConfig } from '@workday/core'
import { describe, expect, it, vi } from 'vitest'
import { HrmHoursLog } from './hrmHoursLog.js'
import type { McpSession } from './mcpSession.js'

const CONFIG: HrmConfig = { mcpUrl: 'https://hrm.example/mcp', projectId: 'P1' }

interface ToolReply {
  readonly isError: boolean
  readonly text: string | null
}

interface Call {
  readonly name: string
  readonly args: Readonly<Record<string, unknown>>
}

const OK: ToolReply = { isError: false, text: '{"success":true,"data":"id","error":null}' }

function failure(code: string, message: string): ToolReply {
  const text = JSON.stringify({ success: false, data: '0', error: { code, message } })
  return { isError: false, text }
}

function fakeSession(reply: (call: Call) => ToolReply | Error): {
  session: McpSession
  calls: Call[]
  close: ReturnType<typeof vi.fn<() => Promise<void>>>
} {
  const calls: Call[] = []
  const close = vi.fn<() => Promise<void>>(() => Promise.resolve())
  const session: McpSession = {
    callTool: (name, args) => {
      const call = { name, args }
      calls.push(call)
      const result = reply(call)
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
    },
    listTools: () => Promise.resolve(),
    close,
  }
  return { session, calls, close }
}

function logFor(session: McpSession): HrmHoursLog {
  return new HrmHoursLog(CONFIG, 'secret-key', () => Promise.resolve(session))
}

describe('logTickets', () => {
  it('splits a slot across lunch into two calls', async () => {
    const { session, calls, close } = fakeSession(() => OK)
    // 5h + 3h: the first ticket straddles lunch, the second runs 15:00-18:00.
    const result = await logFor(session).logTickets('2026-07-01', ['MDP-1', 'MDP-2'], [300, 180])
    expect(result).toEqual({ ok: true })
    expect(calls.map((c) => [c.args['taskId'], c.args['startTime'], c.args['stopTime']])).toEqual([
      ['MDP-1', '09:00:00', '12:00:00'],
      ['MDP-1', '13:00:00', '15:00:00'],
      ['MDP-2', '15:00:00', '18:00:00'],
    ])
    expect(calls.every((c) => c.name === 'log_timesheet' && c.args['projectId'] === 'P1')).toBe(
      true,
    )
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('treats LOGTIME_OVERLAP as done', async () => {
    const { session, calls } = fakeSession(() => failure('LOGTIME_OVERLAP', 'already'))
    const result = await logFor(session).logTickets('2026-07-01', ['MDP-1'], [480])
    expect(result).toEqual({ ok: true })
    expect(calls).toHaveLength(2)
  })

  it('skips a rejected ticket and still logs the next one', async () => {
    const { session, calls } = fakeSession((call) =>
      call.args['taskId'] === 'MDP-1' ? failure('NOT_FOUND', 'no such task') : OK,
    )
    const result = await logFor(session).logTickets('2026-07-01', ['MDP-1', 'MDP-2'], [300, 180])
    expect(result).toEqual({ ok: false, detail: 'HRM rejected MDP-1: NOT_FOUND: no such task' })
    expect(calls.map((c) => c.args['taskId'])).toEqual(['MDP-1', 'MDP-2'])
  })

  it('reports a connection failure as not ok', async () => {
    const log = new HrmHoursLog(CONFIG, 'secret-key', () => Promise.reject(new Error('refused')))
    expect(await log.logTickets('2026-07-01', ['MDP-1'], [480])).toEqual({
      ok: false,
      detail: 'refused',
    })
  })
})

describe('dayHours', () => {
  it('maps each day and uses null for a failed day', async () => {
    const { session, calls } = fakeSession((call) =>
      call.args['workDate'] === '2026-07-02'
        ? new Error('boom')
        : { isError: false, text: '{"success":true,"data":{"totalHours":8}}' },
    )
    const hours = await logFor(session).dayHours(['2026-07-01', '2026-07-02'])
    expect(hours).toEqual({ '2026-07-01': 8, '2026-07-02': null })
    expect(calls[0]).toEqual({
      name: 'get_my_day_logs',
      args: { workDate: '2026-07-01', projectId: null },
    })
  })

  it('returns null for every day when the connection fails', async () => {
    const log = new HrmHoursLog(CONFIG, 'k', () => Promise.reject(new Error('refused')))
    expect(await log.dayHours(['2026-07-01'])).toEqual({ '2026-07-01': null })
  })
})

describe('tasks', () => {
  it('asks once for the range and parses the tasks', async () => {
    const text =
      '{"success":true,"data":[{"taskId":"mdp-3","workDate":"2026-07-01","workingSeconds":60},' +
      '{"taskId":"Meeting","workDate":"2026-07-01","workingSeconds":60}]}'
    const { session, calls } = fakeSession(() => ({ isError: false, text }))
    const tasks = await logFor(session).tasks('2026-07-01', '2026-07-03')
    expect(tasks).toEqual([
      { date: '2026-07-01', ticketKey: 'MDP-3', summary: null, workingSeconds: 60 },
    ])
    expect(calls).toEqual([
      {
        name: 'get_my_timesheet_tasks',
        args: { fromDate: '2026-07-01', toDate: '2026-07-03', projectId: 'P1' },
      },
    ])
  })

  it('returns null when the connection fails', async () => {
    const log = new HrmHoursLog(CONFIG, 'k', () => Promise.reject(new Error('refused')))
    expect(await log.tasks('2026-07-01', '2026-07-03')).toBeNull()
  })
})

describe('offDates', () => {
  function page(totalPages: number, from: string): ToolReply {
    const item = `{"fromDate":"${from}T00:00:00","toDate":"${from}T00:00:00","periodType":"AllDay","status":"Approved"}`
    const text = `{"success":true,"data":{"success":true,"data":[${item}],"pagination":{"totalPages":${String(totalPages)}}}}`
    return { isError: false, text }
  }

  it('reads every page up to totalPages and returns [] on FORBIDDEN', async () => {
    const { session, calls } = fakeSession((call) =>
      call.args['page'] === 1 ? page(2, '2026-07-01') : page(2, '2026-07-02'),
    )
    const dates = await logFor(session).offDates('2026-07-01', '2026-07-31')
    expect(dates).toEqual(['2026-07-01', '2026-07-02'])
    expect(calls).toHaveLength(2)
    expect(calls[0]?.args).toEqual({
      kind: 'leave',
      status: null,
      fromDate: '2026-07-01T00:00:00',
      toDate: '2026-07-31T23:59:59',
      page: 1,
      pageSize: 50,
    })

    const forbidden = fakeSession(() => failure('FORBIDDEN', 'no access'))
    expect(await logFor(forbidden.session).offDates('2026-07-01', '2026-07-31')).toEqual([])
  })

  it('stops at 5 pages however large totalPages claims to be', async () => {
    const { session, calls } = fakeSession(() => page(99, '2026-07-01'))
    await logFor(session).offDates('2026-07-01', '2026-07-31')
    expect(calls).toHaveLength(5)
  })
})

describe('validate', () => {
  it('is ok when the session opens and lists tools', async () => {
    const { session } = fakeSession(() => OK)
    expect(await logFor(session).validate()).toEqual({ ok: true })
  })

  it('reports rejected on a 401', async () => {
    const log = new HrmHoursLog(CONFIG, 'k', () =>
      Promise.reject(new Error('Streamable HTTP error: Error POSTing to endpoint (HTTP 401)')),
    )
    expect(await log.validate()).toEqual({ ok: false, reason: 'rejected' })
  })

  it('reports unreachable on any other failure', async () => {
    const log = new HrmHoursLog(CONFIG, 'k', () => Promise.reject(new Error('ECONNREFUSED')))
    expect(await log.validate()).toEqual({ ok: false, reason: 'unreachable' })
  })
})
