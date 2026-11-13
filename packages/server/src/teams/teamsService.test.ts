import type { TeamsConversationView } from '@workday/core'
import { describe, expect, it } from 'vitest'
import { ME, NOON, pageOf, teamsMessage, threadOf } from '../testing/fakeTeams.js'
import { indexedOwnPost, serviceRig } from '../testing/teamsServiceRig.js'

function threadIn(view: TeamsConversationView): { conversationId: string; rootId: string } | null {
  return view.state === 'thread'
    ? { conversationId: view.conversationId, rootId: view.thread.rootId }
    : null
}

function post(
  id: string,
  subject: string,
  minutes = 0,
  senderId = ME,
): ReturnType<typeof teamsMessage> {
  return teamsMessage(id, { subject, minutes, senderId })
}

describe('TeamsService.read', () => {
  it('uses the indexed own post without reading a page', async () => {
    const { teams, service } = serviceRig(['c1'], indexedOwnPost('c1', 'r1'))
    teams.threads.set('c1|r1', threadOf('c1', 'r1'))

    const view = await service.read('MDP-1', '')

    expect(threadIn(view)).toEqual({ conversationId: 'c1', rootId: 'r1' })
    expect(teams.pageCalls).toEqual([])
  })

  it('drops an indexed post that is gone and reports notPosted', async () => {
    const { teams, service, saved } = serviceRig(['c1'], indexedOwnPost('c1', 'r1'))
    // A deleted root still answers with its replies; the root itself is gone.
    teams.threads.set('c1|r1', { ...threadOf('c1', 'r1'), messages: [teamsMessage('x')] })

    const view = await service.read('MDP-1', '')

    expect(view.state).toBe('notPosted')
    expect(saved.index['c1']?.posts).toEqual({})
  })

  it('prefers an own post across channels, then the post channel', async () => {
    const { teams, service } = serviceRig(['c1', 'c2', 'c3'])
    teams.pages.set(
      'c1|',
      pageOf(
        null,
        post('someone-1', 'MDP-1 x', 50, 'someone'),
        post('someone-2', 'MDP-2 x', 1, 'someone'),
      ),
    )
    teams.pages.set('c2|', pageOf(null, post('mine-1', 'MDP-1 mine')))
    teams.pages.set('c3|', pageOf(null, post('someone-newer-2', 'MDP-2 y', 40, 'someone')))
    for (const [channelId, rootId] of [
      ['c1', 'someone-1'],
      ['c1', 'someone-2'],
      ['c2', 'mine-1'],
      ['c3', 'someone-newer-2'],
    ] as const) {
      teams.threads.set(`${channelId}|${rootId}`, threadOf(channelId, rootId))
    }

    const own = await service.read('MDP-1', '')
    const selected = await service.read('MDP-2', '')

    expect(threadIn(own)).toEqual({ conversationId: 'c2', rootId: 'mine-1' })
    expect(threadIn(selected)).toEqual({ conversationId: 'c1', rootId: 'someone-2' })
  })

  it('read returns searching while the deep scan is unfinished', async () => {
    const { teams, service, clock } = serviceRig(['c1'])
    teams.pages.set('c1|', pageOf('link1', post('a', 'MDP-5 x')))
    for (let page = 1; page < 20; page++) {
      teams.pages.set(
        `c1|link${String(page)}`,
        pageOf(`link${String(page + 1)}`, post(`m${String(page)}`, 'MDP-5 x')),
      )
    }

    const first = await service.read('MDP-1', '')
    clock.now = new Date(NOON.getTime() + 5_000)
    const second = await service.read('MDP-1', '')

    expect(first.state).toBe('searching')
    expect(second.state).toBe('notPosted')
  })

  it('a picked channel waits only for its own scan', async () => {
    const { teams, service } = serviceRig(['c1', 'c2'])
    teams.pages.set('c1|', pageOf('link1', post('a', 'MDP-5 x')))
    for (let page = 1; page < 30; page++) {
      teams.pages.set(
        `c1|link${String(page)}`,
        pageOf(`link${String(page + 1)}`, post(`m${String(page)}`, 'MDP-5 x')),
      )
    }

    const picked = await service.read('MDP-1', 'c2')

    expect(picked.state === 'notPosted' && picked.channelId).toBe('c2')
  })

  it('gives a draft for the first channel when the scan finds no post', async () => {
    const { service } = serviceRig(['c1', 'c2'])

    const view = await service.read('MDP-1', '')

    expect(view.state === 'notPosted' && view.channelId).toBe('c1')
    expect(view.state === 'notPosted' && view.draft.subject).toBe('MDP-1 Summary of MDP-1')
    expect(view.state === 'notPosted' && view.posted).toBe(false)
  })

  it('opens the first ticket chat when no post exists', async () => {
    const { teams, service } = serviceRig(['c1'])
    teams.chats.push({ id: 'chat-9', topic: 'MDP-10 other' }, { id: 'chat-1', topic: 'MDP-1 talk' })
    teams.chatThreads.set('chat-1', {
      conversationId: 'chat-1',
      rootId: '',
      messages: [teamsMessage('m1')],
      isChat: true,
    })

    const view = await service.read('MDP-1', '')

    expect(view.state === 'thread' && view.conversationId).toBe('chat-1')
    expect(view.state === 'thread' && view.options.map((option) => option.id)).toEqual([
      'c1',
      'chat-1',
    ])
  })

  it('reads a chosen ticket chat, and a foreign conversation goes back to the default post', async () => {
    const { teams, service } = serviceRig(['c1'], indexedOwnPost('c1', 'r1'))
    teams.threads.set('c1|r1', threadOf('c1', 'r1'))
    teams.chats.push({ id: 'chat-1', topic: 'MDP-1 talk' })
    teams.chatThreads.set('chat-1', {
      conversationId: 'chat-1',
      rootId: '',
      messages: [teamsMessage('m1')],
      isChat: true,
    })

    const chat = await service.read('MDP-1', 'chat-1')
    const foreign = await service.read('MDP-1', 'chat-other')

    expect(chat.state === 'thread' && chat.thread.isChat).toBe(true)
    expect(threadIn(foreign)).toEqual({ conversationId: 'c1', rootId: 'r1' })
  })

  it('reports signedOut when the session is gone', async () => {
    const { teams, service } = serviceRig(['c1'])
    teams.signedOut = true

    expect((await service.read('MDP-1', '')).state).toBe('signedOut')
    expect(service.status()).toEqual({ configured: true, signedIn: false })
  })

  it('reports notConfigured without a client', async () => {
    const { service } = serviceRig(['c1'])
    service.configure({
      chat: null,
      config: { watchedChannels: [], postLeadName: null, postGreeting: null },
      devRepoPath: null,
      repoLabels: {},
      timeZone: 'UTC',
    })

    expect((await service.read('MDP-1', '')).state).toBe('notConfigured')
  })
})
