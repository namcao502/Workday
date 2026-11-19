import {
  buildTodos,
  groupTodos,
  type BoardState,
  type BugFix,
  type TeamsThread,
} from '@workday/core'
import { describe, expect, it } from 'vitest'
import type { NoticeInput } from '../notices/noticeService.js'
import { ME, NOON, teamsMessage, threadOf } from '../testing/fakeTeams.js'
import { boardWith, makeTicket } from '../testing/fakes.js'
import { indexedOwnPost, serviceRig } from '../testing/teamsServiceRig.js'
import { EMPTY_TEAMS_STATE, type TeamsState } from './teamsStore.js'
import { TeamsWatcher, type NewTeamsMessage } from './teamsWatcher.js'

const KEY = 'MDP-1|c1;messageid=r1'
const OTHER = 'someone'

const DB_CHANNEL = { teamName: 'team', channelName: 'c1' }

function rig(
  options: { dbReview?: boolean; state?: TeamsState; started?: boolean; now?: () => number } = {},
) {
  const { dbReview = false, state = EMPTY_TEAMS_STATE, started = true, now } = options
  const base = serviceRig(['c1'], indexedOwnPost('c1', 'r1'), state)
  const added: NoticeInput[] = []
  const read: string[] = []
  const events: unknown[] = []
  const scheduler = { starts: [] as number[], stops: 0 }
  const board: BoardState = boardWith({
    inProgress: started ? { 'MDP-1': makeTicket('MDP-1') } : {},
  })
  const fixes: BugFix[] = []
  const arrived: NewTeamsMessage[] = []
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
    dbReviewChannel: () => (dbReview ? DB_CHANNEL : null),
    readBugFixes: () => Promise.resolve([...fixes]),
    ...(now === undefined ? {} : { now }),
    onNewMessages: (messages) => arrived.push(...messages),
    logError: () => undefined,
  })
  base.service.onSignedIn(() => {
    watcher.resume()
  })
  const setReplies = (...replies: ReturnType<typeof teamsMessage>[]): void => {
    base.teams.threads.set('c1|r1', threadOf('c1', 'r1', ...replies))
  }
  return { ...base, watcher, added, read, events, scheduler, board, setReplies, fixes, arrived }
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

  it('hands each newly raised message on once, with its newest message id', async () => {
    const h = rig()
    h.setReplies(reply('m1', 5))
    await h.watcher.check()
    expect(h.arrived).toEqual([])
    h.setReplies(reply('m1', 5), reply('m2', 10), reply('m3', 12))

    await h.watcher.check()
    await h.watcher.check()

    expect(h.arrived).toEqual([{ ticketKey: 'MDP-1', conversationId: 'c1', messageId: 'm3' }])
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
        dbReviews: [],
        ticketUpdates: {},
        qcBugs: [],
        bugFixes: [],
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

function approve(minutes: number): ReturnType<typeof teamsMessage> {
  return teamsMessage('a1', {
    senderId: OTHER,
    senderName: 'Lead',
    minutes,
    content: 'approve',
  })
}

describe('TeamsWatcher DB review', () => {
  it('raises one dbReviewApproved notice and one to-do for an approved thread', async () => {
    const h = rig({ dbReview: true })
    h.setReplies(approve(5))

    await h.watcher.check()
    await h.watcher.check()

    expect(h.added).toHaveLength(1)
    expect(h.added[0]).toMatchObject({
      topic: 'teams',
      tone: 'info',
      place: `teams:${KEY}`,
      target: { kind: 'teams', key: 'MDP-1', conversationId: 'c1' },
      event: { type: 'dbReviewApproved', key: 'MDP-1', approver: 'Lead' },
    })
    expect(h.watcher.dbReviewApprovals()).toMatchObject([
      { ticketKey: 'MDP-1', conversationKey: KEY, approverName: 'Lead', sql: 'body' },
    ])
    expect(h.saved.state.dbReviewNotifiedAt[KEY]).toBe(approve(5).sentAt)
    // The approval to-do replaces the "Lead wrote" one.
    expect(h.watcher.items()).toEqual([])
    expect(h.events).toContainEqual({ type: 'work.changed' })
  })

  it('does not notify twice for the same approval, but does for a newer one', async () => {
    const h = rig({ dbReview: true })
    h.setReplies(approve(5))
    await h.watcher.check()
    h.setReplies(approve(5), teamsMessage('m3', { minutes: 8, content: 'e update' }))
    await h.watcher.check()

    expect(h.added).toHaveLength(1)
  })

  it('markDbReviewDone removes the to-do and survives a restart', async () => {
    const h = rig({ dbReview: true })
    h.setReplies(approve(5))
    await h.watcher.check()
    h.events.length = 0

    await h.watcher.markDbReviewDone(KEY)

    expect(h.watcher.dbReviewApprovals()).toEqual([])
    expect(h.saved.state.dbReviewDoneAt[KEY]).toBe(approve(5).sentAt)
    expect(h.events).toContainEqual({ type: 'work.changed' })
    const restarted = rig({ dbReview: true, state: h.saved.state })
    restarted.setReplies(approve(5))
    await restarted.watcher.check()
    expect(restarted.watcher.dbReviewApprovals()).toEqual([])
    expect(restarted.added).toEqual([])
  })

  it('computes nothing without a dbReviewChannel', async () => {
    const h = rig()
    h.setReplies(approve(5))

    await h.watcher.check()

    expect(h.watcher.dbReviewApprovals()).toEqual([])
    expect(h.added.map((input) => input.event.type)).not.toContain('dbReviewApproved')
  })
})

const QC = '8:orgid:00000000-0000-0000-0000-000000000002'

function qcSays(id: string, minutes: number): ReturnType<typeof teamsMessage> {
  return teamsMessage(id, { senderId: QC, senderName: 'Helena QC', minutes, content: 'bug' })
}

function iAnswered(id: string, minutes: number): ReturnType<typeof teamsMessage> {
  return teamsMessage(id, { minutes, content: 'da e fix MDP-9 r nha' })
}

function fixOf(bugKey = 'MDP-9'): BugFix {
  return {
    bugKey,
    parentKey: 'MDP-1',
    summary: 'Fix',
    description: 'done',
    pullRequests: [],
    draftWrittenAt: new Date(NOON.getTime() - 30 * 60_000).toISOString(),
  }
}

function chatThread(...messages: ReturnType<typeof teamsMessage>[]): TeamsThread {
  return { conversationId: 'chat1', rootId: '', messages, isChat: true }
}

describe('TeamsWatcher QC bug fixes', () => {
  it('no to-do for a fix before its first read', async () => {
    const h = rig()
    h.fixes.push(fixOf())
    h.setReplies(qcSays('q1', 5))
    expect(h.watcher.bugFixesToAnswer()).toEqual([])

    await h.watcher.check()

    expect(h.watcher.bugFixesToAnswer()).toEqual([fixOf()])
    expect(h.events).toContainEqual({ type: 'work.changed' })
  })

  it('no to-do when the reply is already sent', async () => {
    const h = rig()
    h.fixes.push(fixOf())
    h.setReplies(qcSays('q1', 5), iAnswered('r1', 10))

    await h.watcher.check()

    expect(h.watcher.bugFixesToAnswer()).toEqual([])
    expect(h.added).toEqual([])
  })

  it('watcher_marks_a_fix_replied_from_any_thread', async () => {
    const h = rig()
    h.fixes.push(fixOf())
    h.setReplies(qcSays('q1', 5))
    h.teams.chats.push({ id: 'chat1', topic: 'MDP-1 talk' })
    h.teams.chatThreads.set('chat1', chatThread(qcSays('k1', 6), iAnswered('k2', 12)))

    await h.watcher.check()
    // The post still has no reply, but that does not undo the chat's.
    await h.watcher.check()

    expect(h.watcher.bugFixesToAnswer()).toEqual([])
    expect(h.added).toEqual([])
  })

  it('watcher_raises_qcBugFixed_once', async () => {
    const h = rig()
    h.fixes.push(fixOf())
    h.setReplies(qcSays('q1', 5))
    h.teams.chats.push({ id: 'chat1', topic: 'MDP-1 talk' })
    h.teams.chatThreads.set('chat1', chatThread(qcSays('k1', 20)))

    await h.watcher.check()
    await h.watcher.check()

    const fixed = h.added.filter((input) => input.event.type === 'qcBugFixed')
    expect(fixed).toHaveLength(1)
    // QC spoke last in the chat, so that is the conversation to answer in.
    expect(fixed[0]).toMatchObject({
      topic: 'teams',
      event: { type: 'qcBugFixed', key: 'MDP-9', parentKey: 'MDP-1' },
      target: { kind: 'teams', key: 'MDP-1', conversationId: 'chat1' },
      place: 'teams:MDP-1|chat1',
    })
  })

  it('watcher_reads_the_parent_thread_of_a_waiting_fix', async () => {
    const h = rig({ started: false })
    h.setReplies(qcSays('q1', 5))
    await h.watcher.check()
    expect(h.watcher.items()).toEqual([])

    h.fixes.push(fixOf())
    await h.watcher.check()

    expect(h.watcher.bugFixesToAnswer()).toEqual([fixOf()])
    expect(h.watcher.items()).toHaveLength(1)
  })

  it('replyCardFor lists the unanswered fixes with the reply that tags QC', async () => {
    const h = rig()
    h.fixes.push(fixOf('MDP-9'), fixOf('MDP-8'))
    const thread = threadOf('c1', 'r1', qcSays('q1', 5))
    h.setReplies(qcSays('q1', 5))
    await h.watcher.check()
    h.added.length = 0

    const cards = h.watcher.replyCardFor('MDP-1', thread, ME)

    expect(cards.map((card) => card.fix.bugKey)).toEqual(['MDP-8', 'MDP-9'])
    expect(cards[0]?.replyHtml).toContain('<span data-mention="0">@Helena QC</span>')
    expect(cards[0]?.mentions).toEqual([{ text: '@Helena QC', mri: QC, displayName: 'Helena QC' }])
    // An answer naming MDP-9 closes only that fix.
    const answered = h.watcher.replyCardFor('MDP-1', threadOf('c1', 'r1', iAnswered('r1', 9)), ME)
    expect(answered.map((card) => card.fix.bugKey)).toEqual(['MDP-8'])
    expect(h.watcher.bugFixesToAnswer().map((fix) => fix.bugKey)).toEqual(['MDP-8'])
  })
})
describe('TeamsWatcher failure backoff', () => {
  it('waits longer after each failed check and starts again after a good one', async () => {
    let clock = 0
    const h = rig({ now: () => clock })
    let reads = 0
    const myId = h.teams.myId.bind(h.teams)
    h.teams.myId = () => {
      reads += 1
      return myId()
    }
    h.teams.readError = new Error('boom')
    const minute = 60_000

    await h.watcher.check()
    expect(reads).toBe(1)
    clock += 1 * minute
    await h.watcher.check()
    expect(reads).toBe(1)
    clock += 1 * minute
    await h.watcher.check()
    expect(reads).toBe(2)
    clock += 4 * minute
    await h.watcher.check()
    expect(reads).toBe(2)
    clock += 1 * minute
    await h.watcher.check()
    expect(reads).toBe(3)

    h.teams.readError = null
    clock += 15 * minute
    await h.watcher.check()
    expect(reads).toBe(4)
    await h.watcher.check()
    expect(reads).toBe(5)
  })
})
