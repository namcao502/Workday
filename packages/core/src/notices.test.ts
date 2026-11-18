import { describe, expect, it } from 'vitest'
import {
  NOTICE_CAP,
  addNotice,
  markAllRead,
  markRead,
  markReadAt,
  noticeChannels,
  noticeText,
  removeExpired,
  type Notice,
  type NoticeEvent,
} from './notices.js'

const morning = '2026-10-16T09:00:00.000Z'

function notice(id: number, overrides: Partial<Notice> = {}): Notice {
  return {
    id,
    at: new Date(Date.parse(morning) + id * 60_000).toISOString(),
    topic: 'other',
    tone: 'info',
    event: { type: 'devMerged', key: 'MDP-1' },
    target: null,
    place: null,
    read: false,
    ...overrides,
  }
}

function ago(now: string, hours: number): string {
  return new Date(Date.parse(now) - hours * 3_600_000).toISOString()
}

describe('removeExpired', () => {
  it('drops a read notice after a day and an unread one after a week', () => {
    const now = '2026-10-24T09:00:00.000Z'
    const notices = [
      notice(1, { at: ago(now, 23), read: true }),
      notice(2, { at: ago(now, 25), read: true }),
      notice(3, { at: ago(now, 24 * 6) }),
      notice(4, { at: ago(now, 24 * 8) }),
    ]
    expect(removeExpired(notices, now).map((n) => n.id)).toEqual([1, 3])
  })

  it('gives the same list when nothing expired', () => {
    const notices = [notice(1), notice(2, { read: true })]
    expect(removeExpired(notices, '2026-10-16T10:00:00.000Z')).toBe(notices)
  })
})

describe('addNotice', () => {
  it('drops the oldest past the cap', () => {
    let notices: readonly Notice[] = []
    for (let id = 1; id <= NOTICE_CAP + 2; id += 1) {
      notices = addNotice(notices, notice(id, { read: id === NOTICE_CAP + 2 }))
    }
    expect(notices).toHaveLength(NOTICE_CAP)
    expect(notices[0]?.id).toBe(3)
    expect(notices.filter((n) => !n.read)).toHaveLength(NOTICE_CAP - 1)
  })
})

describe('markRead', () => {
  it('changes only that notice and ignores an id no longer kept', () => {
    const notices = [notice(1), notice(2)]
    const marked = markRead(notices, 2)
    expect(marked.map((n) => n.read)).toEqual([false, true])
    expect(notices[1]?.read).toBe(false)
    expect(markRead(marked, 99)).toBe(marked)
    expect(markAllRead(marked).every((n) => n.read)).toBe(true)
  })
})

describe('markReadAt', () => {
  it('reads only the notices about that place', () => {
    const notices = [
      notice(1, { place: 'work' }),
      notice(2, { place: 'session:MDP-1' }),
      notice(3),
      notice(4, { place: 'work' }),
    ]
    const marked = markReadAt(notices, 'work')
    expect(marked.map((n) => n.read)).toEqual([true, false, false, true])
    expect(markReadAt(marked, 'work')).toBe(marked)
  })
})

describe('noticeChannels', () => {
  it('uses the topic defaults', () => {
    expect(noticeChannels('claude', {})).toEqual({ toast: true, desktop: true, phone: false })
    expect(noticeChannels('pr', {})).toEqual({ toast: true, desktop: false, phone: true })
    expect(noticeChannels('suggestions', {})).toEqual({ toast: true, desktop: false, phone: false })
    // The phone already gets the run's own push, so the log topic does not push again.
    expect(noticeChannels('log', {})).toEqual({ toast: true, desktop: true, phone: false })
  })

  it('lets a saved choice override one channel', () => {
    expect(noticeChannels('jira', { jira: { desktop: true } })).toEqual({
      toast: true,
      desktop: true,
      phone: true,
    })
  })
})

describe('noticeText', () => {
  const events: readonly NoticeEvent[] = [
    { type: 'qcBugFixed', key: 'MDP-9323', parentKey: 'MDP-9310' },
    { type: 'logRun', logged: 1, kept: 0, timedOut: false },
    { type: 'logRun', logged: 1, kept: 1, timedOut: false },
    { type: 'logRun', logged: 0, kept: 1, timedOut: true },
    { type: 'logReminder' },
    { type: 'claudeWait', subject: 'MDP-1', wait: 'permission' },
    { type: 'claudeWait', subject: 'MDP-1', wait: 'finished' },
    { type: 'claudeWait', subject: 'MDP-1', wait: 'question' },
    { type: 'prMerged', key: 'MDP-1', branch: 'FE Portal dev' },
    { type: 'prBuildFailed', key: 'MDP-1', branch: 'BE main' },
    { type: 'prConflicted', key: 'MDP-1', branch: 'BE main' },
    { type: 'prComments', key: 'MDP-1', branch: 'BE main', count: 3 },
    { type: 'prVote', key: 'MDP-1', branch: 'BE main', vote: 'approved' },
    { type: 'prVote', key: 'MDP-1', branch: 'BE main', vote: 'waitingForAuthor' },
    { type: 'prVote', key: 'MDP-1', branch: 'BE main', vote: 'rejected' },
    { type: 'prReviewRequested', author: 'Lan', title: 'Fix x' },
    { type: 'devMerged', key: 'MDP-1' },
    { type: 'deployed', key: 'MDP-1', moved: true },
    { type: 'deployed', key: 'MDP-1', moved: false },
    { type: 'deployFailed', key: 'MDP-1', pipeline: 'Portal' },
    { type: 'movedToReadyToTest', key: 'MDP-1' },
    { type: 'alreadyPastReadyToTest', key: 'MDP-1' },
    { type: 'ticketMissing', key: 'MDP-1' },
    { type: 'transitionFailed', key: 'MDP-1', status: 'Ready to Test' },
    { type: 'suggestionsUrgent', keys: ['MDP-2', 'MDP-3'] },
    { type: 'newTickets', keys: ['MDP-2', 'MDP-3'] },
    { type: 'qcBugLogged', key: 'MDP-9', parentKey: 'MDP-1', summary: 'It breaks' },
    { type: 'ticketsDone', keys: ['MDP-2'] },
    { type: 'ticketsReopened', keys: ['MDP-2'] },
    { type: 'autoStartFailed', key: 'MDP-2', code: 'worktreeFailed' },
  ]

  it('words the Jira poll events like the C# app', () => {
    expect(noticeText({ type: 'newTickets', keys: ['MDP-2', 'MDP-3'] }, 'en')).toBe(
      'New ticket(s): MDP-2, MDP-3',
    )
    expect(noticeText({ type: 'newTickets', keys: ['MDP-2'] }, 'vi')).toBe('Ticket mới: MDP-2')
    const bug = {
      type: 'qcBugLogged',
      key: 'MDP-9',
      parentKey: 'MDP-1',
      summary: 'Broken',
    } as const
    expect(noticeText(bug, 'en')).toBe('QC logged bug MDP-9 on MDP-1: Broken')
    expect(noticeText(bug, 'vi')).toBe('QC log bug MDP-9 cho MDP-1: Broken')
    expect(noticeText({ type: 'ticketsDone', keys: ['MDP-2'] }, 'en')).toBe(
      'Done in Jira, moved to Done: MDP-2',
    )
    expect(noticeText({ type: 'ticketsReopened', keys: ['MDP-2'] }, 'vi')).toBe(
      'Bị trả về để làm tiếp, đã chuyển sang Đang làm: MDP-2',
    )
  })

  it('names the changed fields of a ticketUpdated event, with the editor when known', () => {
    const event: NoticeEvent = {
      type: 'ticketUpdated',
      key: 'MDP-1',
      fields: ['summary', 'dueDate', 'eta', 'devPriority'],
      changedBy: null,
    }
    expect(noticeText(event, 'en')).toBe('MDP-1 was updated in Jira: title, Due, ETA, P')
    expect(noticeText(event, 'vi')).toBe('MDP-1 được cập nhật trên Jira: tiêu đề, Due, ETA, P')
    const byAn = { ...event, fields: ['description', 'attachments'], changedBy: 'An' } as const
    expect(noticeText(byAn, 'en')).toBe(
      'MDP-1 was updated in Jira: description, attachments (by An)',
    )
    expect(noticeText(byAn, 'vi')).toBe(
      'MDP-1 được cập nhật trên Jira: mô tả, file đính kèm (bởi An)',
    )
  })

  it('has an English and a Vietnamese sentence for every event type', () => {
    for (const event of events) {
      const english = noticeText(event, 'en')
      const vietnamese = noticeText(event, 'vi')
      expect(english.trim(), event.type).not.toBe('')
      expect(vietnamese.trim(), event.type).not.toBe('')
      expect(vietnamese, event.type).not.toBe(english)
    }
  })

  it('words the auto-log run like the C# app', () => {
    const clean: NoticeEvent = { type: 'logRun', logged: 2, kept: 0, timedOut: false }
    expect(noticeText(clean, 'en')).toBe('Auto-log: 2 logged.')
    expect(noticeText(clean, 'vi')).toBe('Tự log: đã log 2.')
    const kept: NoticeEvent = { type: 'logRun', logged: 1, kept: 1, timedOut: false }
    expect(noticeText(kept, 'en')).toBe(
      'Auto-log: 1 logged, 1 kept. Check the TSC sign-in - it retries automatically.',
    )
    const late: NoticeEvent = { type: 'logRun', logged: 0, kept: 2, timedOut: true }
    expect(noticeText(late, 'vi')).toBe(
      'Tự log quá thời gian; đã giữ lại 2 để thử lại. Nếu lặp lại, hãy kiểm tra đăng nhập TSC.',
    )
    expect(noticeText({ type: 'logReminder' }, 'en')).toBe(
      'Reminder: nothing is queued for today - log your work before you leave.',
    )
  })

  it('words a fixed QC bug in English and Vietnamese', () => {
    const event: NoticeEvent = { type: 'qcBugFixed', key: 'MDP-9323', parentKey: 'MDP-9310' }
    expect(noticeText(event, 'en')).toBe(
      "MDP-9323 is fixed - answer QC on MDP-9310's Teams thread.",
    )
    expect(noticeText(event, 'vi')).toBe(
      'MDP-9323 đã sửa xong - trả lời QC trên thread Teams của MDP-9310.',
    )
  })

  it('words a merged PR like the C# app', () => {
    const event: NoticeEvent = { type: 'prMerged', key: 'MDP-1', branch: 'FE Portal dev' }
    expect(noticeText(event, 'en')).toBe('MDP-1: PR (FE Portal dev) merged.')
    expect(noticeText(event, 'vi')).toBe('MDP-1: PR (FE Portal dev) đã merge.')
  })
})
