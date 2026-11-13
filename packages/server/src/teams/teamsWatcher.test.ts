import { buildTodos, groupTodos, type BoardState, type TeamsThread } from '@workday/core'
import { describe, expect, it } from 'vitest'
import type { NoticeInput } from '../notices/noticeService.js'
import { ME, teamsMessage, threadOf } from '../testing/fakeTeams.js'
import { boardWith, makeTicket } from '../testing/fakes.js'
import { indexedOwnPost, serviceRig } from '../testing/teamsServiceRig.js'
import { TeamsWatcher } from './teamsWatcher.js'

const KEY = 'MDP-1|c1;messageid=r1'
const OTHER = 'someone'

function rig() {
  const base = serviceRig(['c1'], indexedOwnPost('c1', 'r1'))
  const added: NoticeInput[] = []
  const read: string[] = []
  const events: unknown[] = []
  const scheduler = { starts: [] as number[], stops: 0 }
  const board: BoardState = boardWith({ inProgress: { 'MDP-1': makeTicket('MDP-1') } })
  const watcher = new TeamsWatcher({
    lookup: base.service.lookup,
    board: { snapshot: () => board },
    workspace: { view: () => ({ tabs: [] }) },
    notices: {
      add: (input) => {
        added.push(input)
        return Promise.resolve()
      },
      markReadAt: (place) => {
        read.push(place)
        return Promise.resolve()
      },
    },
    events: { broadcast: (event) => events.push(event) },
    scheduler: {
      start: (minutes) => scheduler.starts.push(minutes),
      stop: () => {
        scheduler.stops += 1
      },
    },
    logError: () => undefined,
  })
  base.service.onSignedIn(() => {
    watcher.resume()
  })
  const setReplies = (...replies: ReturnType<typeof teamsMessage>[]): void => {
    base.teams.threads.set('c1|r1', threadOf('c1', 'r1', ...replies))
  }
  return { ...base, watcher, added, read, events, scheduler, board, setReplies }
}

function reply(id: string, minutes: number, mention = false): ReturnType<typeof teamsMessage> {
  return teamsMessage(id, {
    senderId: OTHER,
    senderName: 'Lan',
    minutes,
    mentionMris: mention ? { x: ME } : {},
  })
}

describe('TeamsWatcher.check', () => {
  it('the first check only records marks and raises no notice', async () => {
    const h = rig()
    h.setReplies(reply('m1', 5))

    await h.watcher.check()

    expect(h.added).toEqual([])
    expect(h.saved.state.baselineDone).toBe(true)
    expect(h.saved.state.notifiedAt[KEY]).toBe(reply('m1', 5).sentAt)
    expect(h.watcher.items()).toHaveLength(1)
  })

  it('a new message from someone else raises one notice and a teams to-do', async () => {
    const h = rig()
    h.setReplies(reply('m1', 5))
    await h.watcher.check()
    h.setReplies(reply('m1', 5), reply('m2', 10))

    await h.watcher.check()
    await h.watcher.check()

    expect(h.added).toHaveLength(1)
    expect(h.added[0]).toMatchObject({
      topic: 'teams',
      place: `teams:${KEY}`,
      target: { kind: 'teams', key: 'MDP-1', conversationId: 'c1' },
      event: { type: 'teamsMessage', key: 'MDP-1', sender: 'Lan', mention: false },
    })
    expect(h.watcher.items().map((item) => item.sentAt)).toEqual([reply('m2', 10).sentAt])
    expect(h.watcher.pendingIds('MDP-1')).toEqual(['c1'])
    expect(h.events).toContainEqual({ type: 'work.changed' })
  })

  it('a mention makes the to-do needed now and uses the teamsMention topic', async () => {
    const h = rig()
    h.setReplies(reply('m1', 5))
    await h.watcher.check()
    h.setReplies(reply('m1', 5), reply('m2', 10, true))

    await h.watcher.check()

    expect(h.added[0]?.topic).toBe('teamsMention')
    const groups = groupTodos(
      buildTodos({
        board: h.board,
        today: '2026-11-13',
        flow: {
          preWorkStatuses: [],
          reworkStatuses: [],
          readyToTestPath: [],
          developerStatuses: [],
        },
        tracking: {},
        repoLabels: {},
        commentAlerts: {},
        reviews: {},
        deploys: {},
        waits: [],
        teams: h.watcher.items(),
      }),
    )
    expect(groups.map((group) => [group.ticketKey, group.neededNow])).toEqual([['MDP-1', true]])
    expect(groups[0]?.items[0]?.kind).toBe('teamsMessage')
  })

  it('seen clears the to-do and reads the notice', async () => {
    const h = rig()
    h.setReplies(reply('m1', 5))
    await h.watcher.check()
    h.setReplies(reply('m1', 5), reply('m2', 10))
    await h.watcher.check()

    await h.watcher.seen('MDP-1', 'c1')
    await h.watcher.check()

    expect(h.watcher.items()).toEqual([])
    expect(h.read).toEqual([`teams:${KEY}`])
    expect(h.saved.state.seenAt[KEY]).toBe(reply('m2', 10).sentAt)
    expect(h.added).toHaveLength(1)
  })

  it('a chat that appears after the first check is news, a new post is not', async () => {
    const h = rig()
    h.setReplies(reply('m1', 5))
    await h.watcher.check()
    h.teams.chats.push({ id: 'chat1', topic: 'MDP-1 talk' })
    const chat: TeamsThread = {
      conversationId: 'chat1',
      rootId: '',
      messages: [reply('k1', 20)],
      isChat: true,
    }
    h.teams.chatThreads.set('chat1', chat)
    // The chat list is cached for 10 minutes.
    h.clock.now = new Date(h.clock.now.getTime() + 11 * 60_000)

    await h.watcher.check()

    expect(h.added.map((input) => input.target)).toEqual([
      { kind: 'teams', key: 'MDP-1', conversationId: 'chat1' },
    ])
    expect(h.watcher.pendingIds('MDP-1')).toEqual(['c1', 'chat1'])
  })

  it('skips a gone post and a chat that cannot be read', async () => {
    const h = rig()
    h.teams.threads.clear()
    h.teams.chats.push({ id: 'bad', topic: 'MDP-1 a' }, { id: 'good', topic: 'MDP-1 b' })
    h.teams.chatThreads.set('good', {
      conversationId: 'good',
      rootId: '',
      messages: [reply('k1', 1)],
      isChat: true,
    })

    await h.watcher.check()

    expect(h.watcher.pendingIds('MDP-1')).toEqual(['good'])
  })

  it('a signed-out session stops the watcher until sign-in', async () => {
    const h = rig()
    h.teams.signedOut = true

    await h.watcher.check()
    expect(h.scheduler.stops).toBe(1)
    expect(h.scheduler.starts).toEqual([])

    h.teams.signedOut = false
    await h.service.signIn()

    expect(h.scheduler.starts).toEqual([2])
  })
})
