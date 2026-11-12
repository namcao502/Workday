import { describe, expect, it } from 'vitest'
import {
  buildLogArgs,
  parseDayHours,
  parseOffDates,
  parseTimesheetTasks,
  parseToolEnvelope,
  parseTotalPages,
} from './parseHrm.js'

describe('parseToolEnvelope', () => {
  it('treats business success:false as a failure with code and message', () => {
    const envelope = parseToolEnvelope(
      false,
      '{"success":false,"data":"0","error":{"code":"FUTURE_STOP","message":"no future"}}',
    )
    expect(envelope).toEqual({
      success: false,
      error: 'FUTURE_STOP: no future',
      code: 'FUTURE_STOP',
    })
  })

  it('surfaces the code so an overlap can be handled as a skip', () => {
    const envelope = parseToolEnvelope(
      false,
      '{"success":false,"data":"0","error":{"code":"LOGTIME_OVERLAP","message":"overlap"}}',
    )
    expect(envelope.code).toBe('LOGTIME_OVERLAP')
  })

  it('treats success:true as success', () => {
    expect(parseToolEnvelope(false, '{"success":true,"data":"id-1","error":null}')).toEqual({
      success: true,
      error: null,
      code: null,
    })
  })

  it('treats an MCP-level isError as a failure', () => {
    expect(parseToolEnvelope(true, 'boom')).toEqual({ success: false, error: 'boom', code: null })
    expect(parseToolEnvelope(true, null).error).toBe('MCP tool error')
  })

  it('treats a non-envelope text as success', () => {
    expect(parseToolEnvelope(false, 'not json').success).toBe(true)
  })
})

describe('buildLogArgs', () => {
  const args = buildLogArgs('P1', 'MDP-7706', '2026-07-01', { start: '09:00', end: '12:00' })

  it('maps ticket, date and HH:mm:ss times', () => {
    expect(args['projectId']).toBe('P1')
    expect(args['taskId']).toBe('MDP-7706')
    expect(args['workDate']).toBe('2026-07-01')
    expect(args['startTime']).toBe('09:00:00')
    expect(args['stopTime']).toBe('12:00:00')
  })

  it('leaves auto-filled fields null, marks billable and sends all 11 fields', () => {
    expect(Object.keys(args)).toHaveLength(11)
    for (const field of [
      'description',
      'comment',
      'issueType',
      'projectStageId',
      'idempotencyKey',
    ]) {
      expect(args[field]).toBeNull()
    }
    expect(args['isBillable']).toBe(true)
  })
})

describe('parseDayHours', () => {
  it('reads totalHours', () => {
    expect(
      parseDayHours(false, '{"success":true,"data":{"totalHours":8.0,"totalSeconds":28800}}'),
    ).toBe(8)
  })

  it('reads the real get_my_day_logs shape', () => {
    const text =
      '{"success":true,"data":{"workDate":"2025-07-01","totalSeconds":28800,"totalHours":8,"intervals":[{"taskId":"MDP-4243"}]}}'
    expect(parseDayHours(false, text)).toBe(8)
  })

  it('falls back to totalSeconds / 3600', () => {
    expect(parseDayHours(false, '{"success":true,"data":{"totalSeconds":18000}}')).toBe(5)
  })

  it('is case-insensitive on the field name', () => {
    expect(parseDayHours(false, '{"success":true,"data":{"TotalHours":7.5}}')).toBe(7.5)
  })

  it.each([
    [true, '{"success":true,"data":{"totalHours":8}}'],
    [false, '{"success":false,"error":{"code":"X"}}'],
    [false, '{"success":true,"data":{}}'],
    [false, 'not json'],
    [false, ''],
  ])('returns null when unavailable (%s, %s)', (isError, text) => {
    expect(parseDayHours(isError, text)).toBeNull()
  })
})

describe('parseTimesheetTasks', () => {
  const json =
    '{"success":true,"data":[' +
    '{"id":"9c17","taskId":"MDP-9379","description":"JIT Transfer","workDate":"2026-10-22","workingSeconds":28800},' +
    '{"id":"5224","taskId":"MDP-8324","description":"Save original carrier","workDate":"2026-10-21","workingSeconds":14400}]}'

  it('reads each task', () => {
    expect(parseTimesheetTasks(false, json)).toEqual([
      { date: '2026-10-22', ticketKey: 'MDP-9379', summary: 'JIT Transfer', workingSeconds: 28800 },
      {
        date: '2026-10-21',
        ticketKey: 'MDP-8324',
        summary: 'Save original carrier',
        workingSeconds: 14400,
      },
    ])
  })

  it.each([
    [true, '{"success":true,"data":[]}'],
    [false, '{"success":false,"error":"FORBIDDEN"}'],
    [false, 'not json'],
  ])('returns null on an error or unsuccessful result (%s, %s)', (isError, text) => {
    expect(parseTimesheetTasks(isError, text)).toBeNull()
  })

  it('skips an entry with a bad key or date and uppercases a lowercase key', () => {
    const text =
      '{"success":true,"data":[' +
      '{"taskId":"Meeting","workDate":"2026-10-22","workingSeconds":3600},' +
      '{"taskId":"MDP-1","workDate":"22/10/2026","workingSeconds":3600},' +
      '{"taskId":"mdp-2","workDate":"2026-10-22","workingSeconds":3600}]}'
    expect(parseTimesheetTasks(false, text)).toEqual([
      { date: '2026-10-22', ticketKey: 'MDP-2', summary: null, workingSeconds: 3600 },
    ])
  })
})

function envelope(...items: string[]): string {
  return (
    '{"success":true,"data":{"success":true,"data":[' +
    items.join(',') +
    `],"pagination":{"page":1,"pageSize":50,"totalCount":${String(items.length)},"totalPages":1}}}`
  )
}

function request(from: string, to: string, periodType: string, status: string): string {
  return `{"fromDate":"${from}T00:00:00","toDate":"${to}T00:00:00","periodType":"${periodType}","status":"${status}"}`
}

describe('parseOffDates', () => {
  it('returns the date of an approved all-day request', () => {
    expect(
      parseOffDates(false, envelope(request('2026-08-31', '2026-08-31', 'AllDay', 'Approved'))),
    ).toEqual(['2026-08-31'])
  })

  it('expands a multi-day range inclusively', () => {
    expect(
      parseOffDates(false, envelope(request('2026-04-28', '2026-04-30', 'AllDay', 'Approved'))),
    ).toEqual(['2026-04-28', '2026-04-29', '2026-04-30'])
  })

  it('skips half-day requests', () => {
    const text = envelope(
      request('2026-03-27', '2026-03-27', 'SecondHalf', 'Approved'),
      request('2026-03-28', '2026-03-28', 'FirstHalf', 'Approved'),
    )
    expect(parseOffDates(false, text)).toEqual([])
  })

  it('counts a submitted request before it is approved', () => {
    const text = envelope(
      request('2026-09-10', '2026-09-10', 'AllDay', 'Pending'),
      request('2026-09-11', '2026-09-11', 'AllDay', 'Approved'),
    )
    expect(parseOffDates(false, text)).toEqual(['2026-09-10', '2026-09-11'])
  })

  it('skips rejected and cancelled requests', () => {
    const text = envelope(
      request('2026-09-11', '2026-09-11', 'AllDay', 'Rejected'),
      request('2026-09-12', '2026-09-12', 'AllDay', 'Cancelled'),
    )
    expect(parseOffDates(false, text)).toEqual([])
  })

  it('deduplicates and sorts overlapping requests', () => {
    const text = envelope(
      request('2026-09-11', '2026-09-11', 'AllDay', 'Approved'),
      request('2026-09-10', '2026-09-11', 'AllDay', 'Approved'),
    )
    expect(parseOffDates(false, text)).toEqual(['2026-09-10', '2026-09-11'])
  })

  it('returns [] on a FORBIDDEN envelope', () => {
    expect(
      parseOffDates(false, '{"success":false,"error":{"code":"FORBIDDEN","message":"no access"}}'),
    ).toEqual([])
  })

  it('returns [] on an MCP-level error', () => {
    expect(
      parseOffDates(true, envelope(request('2026-08-31', '2026-08-31', 'AllDay', 'Approved'))),
    ).toEqual([])
  })

  it('returns [] on malformed or empty text', () => {
    expect(parseOffDates(false, 'not json')).toEqual([])
    expect(parseOffDates(false, '')).toEqual([])
    expect(parseOffDates(false, null)).toEqual([])
  })

  it('returns [] when the inner envelope is missing', () => {
    const text = `{"success":true,"data":[${request('2026-08-31', '2026-08-31', 'AllDay', 'Approved')}]}`
    expect(parseOffDates(false, text)).toEqual([])
  })
})

describe('parseTotalPages', () => {
  it('reads data.pagination.totalPages', () => {
    const text = '{"success":true,"data":{"success":true,"data":[],"pagination":{"totalPages":3}}}'
    expect(parseTotalPages(text)).toBe(3)
  })

  it('defaults to 1 on anything unrecognised', () => {
    expect(parseTotalPages(null)).toBe(1)
    expect(parseTotalPages('not json')).toBe(1)
    expect(parseTotalPages('{"success":false}')).toBe(1)
    expect(parseTotalPages(envelope().replace('"totalPages":1', '"totalPages":0'))).toBe(1)
  })
})
