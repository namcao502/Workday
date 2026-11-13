import type { Notice, NoticePrefs, ServerEvent } from '@workday/core'
import { NOTICE_CAP } from '@workday/core'
import { describe, expect, it, vi } from 'vitest'
import type { PushMessage } from '../remote/pushService.js'
import { NoticeService, type NoticeInput } from './noticeService.js'

const NOW = new Date('2026-11-13T10:00:00Z')
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

interface Harness {
  readonly service: NoticeService
  readonly saved: (readonly Notice[])[]
  readonly events: ServerEvent[]
  readonly pushes: { area: string; message: PushMessage }[]
  readonly localPushes: PushMessage[]
  readonly errors: string[]
}

function input(overrides: Partial<NoticeInput> = {}): NoticeInput {
  return {
    topic: 'other',
    tone: 'info',
    event: { type: 'ticketMissing', key: 'MDP-1' },
    target: null,
    place: null,
    ...overrides,
  }
}

function aged(id: number, ageMs: number, read: boolean): Notice {
  return { ...input(), id, at: new Date(NOW.getTime() - ageMs).toISOString(), read }
}

function harness(
  options: {
    initial?: readonly Notice[]
    prefs?: NoticePrefs
    failSave?: boolean
    failLocalPush?: boolean
    now?: () => Date
  } = {},
): Harness {
  const saved: (readonly Notice[])[] = []
  const events: ServerEvent[] = []
  const pushes: { area: string; message: PushMessage }[] = []
  const localPushes: PushMessage[] = []
  const errors: string[] = []
  const service = new NoticeService({
    initial: options.initial ?? [],
    save: (notices) => {
      if (options.failSave === true) {
        return Promise.reject(new Error('disk full'))
      }
      saved.push(notices)
      return Promise.resolve()
    },
    events: { broadcast: (event) => events.push(event) },
    now: options.now ?? (() => NOW),
    push: (area, message) => {
      pushes.push({ area, message })
      return Promise.resolve()
    },
    pushLocal: (message) => {
      if (options.failLocalPush === true) {
        return Promise.reject(new Error('boom'))
      }
      localPushes.push(message)
      return Promise.resolve()
    },
    settings: () => ({ prefs: options.prefs ?? {}, language: 'en' }),
    logError: (message) => errors.push(message),
  })
  return { service, saved, events, pushes, localPushes, errors }
}

describe('NoticeService', () => {
  it('add keeps the notice unread, saves, broadcasts and counts it', async () => {
    const { service, saved, events } = harness()

    const notice = await service.add(input({ topic: 'claude', place: 'session:MDP-1' }))

    expect(notice).toMatchObject({ id: 1, read: false, topic: 'claude', at: NOW.toISOString() })
    expect(service.view().unread).toBe(1)
    expect(saved).toHaveLength(1)
    expect(events).toEqual([{ type: 'notices.changed' }])
  })

  it('a restart reads the saved notices as read and the ids go on', async () => {
    const { service } = harness({ initial: [aged(7, HOUR_MS, false)] })

    const next = await service.add(input())

    expect(service.view().notices[0]).toMatchObject({ id: 7, read: true })
    expect(next.id).toBe(8)
  })

  it('a restart drops expired notices before marking the rest read', () => {
    const { service } = harness({
      initial: [
        aged(1, 2 * DAY_MS, true),
        aged(2, 12 * HOUR_MS, false),
        aged(3, 8 * DAY_MS, false),
      ],
    })

    expect(service.view().notices.map((notice) => notice.id)).toEqual([2])
  })

  it('add keeps the newest hundred', async () => {
    const { service } = harness()

    for (let index = 1; index <= NOTICE_CAP + 5; index += 1) {
      await service.add(input())
    }

    const { notices } = service.view()
    expect(notices).toHaveLength(NOTICE_CAP)
    expect(notices[0]?.id).toBe(6)
  })

  it('add and view drop what expired; add saves the shorter list', async () => {
    let now = NOW
    const { service, saved } = harness({ now: () => now })
    await service.add(input())
    await service.markAllRead()
    now = new Date(NOW.getTime() + 2 * DAY_MS)

    expect(service.view().notices).toEqual([])
    await service.add(input())

    expect(saved[saved.length - 1]?.map((notice) => notice.id)).toEqual([2])
  })

  it('markRead, markReadAt and markAllRead save and broadcast only on a change', async () => {
    const { service, saved, events } = harness()
    const one = await service.add(input({ place: 'session:MDP-1' }))
    await service.add(input({ place: 'session:MDP-2' }))
    await service.add(input({ place: 'session:MDP-1' }))
    events.length = 0
    saved.length = 0

    await service.markRead(one.id)
    await service.markRead(one.id)
    await service.markReadAt('session:MDP-1')
    await service.markReadAt('session:MDP-1')

    expect(service.view().unread).toBe(1)
    await service.markAllRead()
    await service.markAllRead()
    expect(service.view().unread).toBe(0)
    expect(saved).toHaveLength(3)
    expect(events).toHaveLength(3)
  })

  it("add pushes to the board area only when the topic's phone channel is on", async () => {
    const { service, pushes } = harness({ prefs: { jira: { phone: true }, pr: { phone: false } } })

    await service.add(input({ topic: 'jira' }))
    await service.add(input({ topic: 'pr' }))
    await service.add(input({ topic: 'claude' }))
    await service.add(
      input({ topic: 'jira', target: { kind: 'url', url: 'https://example.com/pr/1' } }),
    )

    expect(pushes.map((push) => push.area)).toEqual(['board', 'board'])
    expect(pushes[0]?.message).toEqual({
      title: 'Workday',
      body: 'MDP-1 was not found in Jira.',
      url: '/#/board',
      tag: 'notice-1',
    })
    expect(pushes[1]?.message.url).toBe('https://example.com/pr/1')
  })

  it('a failed save still returns the notice and broadcasts', async () => {
    const { service, events, errors } = harness({ failSave: true })

    const notice = await service.add(input())

    expect(notice.id).toBe(1)
    expect(service.view().notices).toHaveLength(1)
    expect(events).toEqual([{ type: 'notices.changed' }])
    expect(errors).toEqual(['Saving the notices failed'])
  })

  it('a desktop notice is pushed to local subscriptions with its tag', async () => {
    const { service, localPushes } = harness({ prefs: { other: { desktop: true } } })

    const notice = await service.add(
      input({ target: { kind: 'workspace', tab: 'MDP-1', session: 'MDP-1~2' } }),
    )

    expect(localPushes).toEqual([
      {
        title: 'Workday',
        body: expect.stringContaining('MDP-1') as string,
        url: '/#/workspace/MDP-1/MDP-1~2',
        tag: `notice-${String(notice.id)}`,
      },
    ])
  })

  it('a notice without the desktop channel is not pushed locally', async () => {
    const { service, localPushes } = harness({ prefs: { other: { desktop: false } } })

    await service.add(input())

    expect(localPushes).toEqual([])
  })

  it('a failed local push is only logged', async () => {
    const { service, errors } = harness({
      prefs: { other: { desktop: true } },
      failLocalPush: true,
    })
    await service.add(input())
    await vi.waitFor(() => {
      expect(errors).toHaveLength(1)
    })

    expect(errors).toEqual(['Pushing a notice locally failed'])
  })
})
