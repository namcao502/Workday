import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { loadNotices } from './noticeStore.js'

it('a restart keeps Teams, mention and auto-log notices, not only the older topics', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'workday-notices-'))
  const notice = (id: number, topic: string, target: unknown): unknown => ({
    id,
    at: '2026-11-18T11:00:20.000Z',
    topic,
    tone: 'info',
    event: { type: 'logReminder' },
    target,
    place: null,
    read: false,
  })
  const teamsTarget = { kind: 'teams', key: 'MDP-1', conversationId: 'c' }
  writeFileSync(
    join(dataDir, 'notices.json'),
    JSON.stringify([
      notice(1, 'teams', teamsTarget),
      notice(2, 'teamsMention', teamsTarget),
      notice(3, 'log', { kind: 'timesheet' }),
      notice(4, 'nonsense', null),
    ]),
  )
  expect(loadNotices(dataDir).map((item) => item.topic)).toEqual(['teams', 'teamsMention', 'log'])
})
