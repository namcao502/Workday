import { TeamsUncertain, type TeamsDraft } from '@workday/core'
import { describe, expect, it } from 'vitest'
import { ME, NOON, teamsMessage, threadOf } from '../testing/fakeTeams.js'
import { indexedOwnPost, serviceRig } from '../testing/teamsServiceRig.js'

function draft(html: string): TeamsDraft {
  return { html, mentions: [] }
}

const POST = { channelId: 'c1', subject: 'MDP-1 Fix', draft: draft('<p>Done</p>'), confirm: false }

function postedRig(): ReturnType<typeof serviceRig> {
  const rig = serviceRig(['c1'], indexedOwnPost('c1', 'r1'))
  rig.teams.threads.set(
    'c1|r1',
    threadOf(
      'c1',
      'r1',
      teamsMessage('reply-mine'),
      teamsMessage('reply-theirs', { senderId: 'someone' }),
    ),
  )
  return rig
}

describe('TeamsWrites', () => {
  it('posts, records postedAt and indexes the new post', async () => {
    const { teams, service, saved } = serviceRig(['c1'])

    const result = await service.write.post('MDP-1', POST)

    expect(result).toEqual({ ok: true, id: 'sent-1' })
    expect(teams.sent[0]?.subject).toBe('MDP-1 Fix')
    expect(saved.index['c1']?.posts['MDP-1']).toEqual({
      rootId: 'sent-1',
      sentAt: NOON.toISOString(),
      mine: true,
    })
    expect(saved.state.postedAt['MDP-1']).toBe(NOON.toISOString())
  })

  it('a second post of a posted ticket only warns until confirm', async () => {
    const { teams, service } = serviceRig(['c1'])
    await service.write.post('MDP-1', POST)

    const warned = await service.write.post('MDP-1', POST)
    const confirmed = await service.write.post('MDP-1', { ...POST, confirm: true })

    expect(warned).toEqual({ ok: false, error: { code: 'teamsUncertain' } })
    expect(confirmed).toEqual({ ok: true, id: 'sent-2' })
    expect(teams.sent).toHaveLength(2)
  })

  it('a post that went out stays ok when saving its mark fails, and still blocks a second post', async () => {
    const { teams, service, saved } = serviceRig(['c1'])
    saved.fail = true

    const first = await service.write.post('MDP-1', POST)
    const second = await service.write.post('MDP-1', POST)

    expect(first).toEqual({ ok: true, id: 'sent-1' })
    expect(second).toEqual({ ok: false, error: { code: 'teamsUncertain' } })
    expect(teams.sent).toHaveLength(1)
  })

  it('an uncertain post asks for confirm before the same content goes again', async () => {
    const { teams, service } = serviceRig(['c1'])
    teams.writeError = new TeamsUncertain('maybe')
    const first = await service.write.post('MDP-1', POST)
    teams.writeError = null

    const again = await service.write.post('MDP-1', POST)

    expect(first).toEqual({ ok: false, error: { code: 'teamsUncertain' } })
    expect(again).toEqual({ ok: false, error: { code: 'teamsUncertain' } })
    expect(teams.sent).toEqual([])
  })

  it('an uncertain reply asks for confirm before sending the same text again', async () => {
    const { teams, service } = postedRig()
    const reply = { conversationId: 'c1', rootId: 'r1', draft: draft('<p>ok</p>'), confirm: false }
    teams.writeError = new TeamsUncertain('maybe')
    const first = await service.write.reply('MDP-1', reply)
    teams.writeError = null

    const same = await service.write.reply('MDP-1', reply)
    const other = await service.write.reply('MDP-1', { ...reply, draft: draft('<p>other</p>') })
    const confirmed = await service.write.reply('MDP-1', { ...reply, confirm: true })

    expect(first).toEqual({ ok: false, error: { code: 'teamsUncertain' } })
    expect(same).toEqual({ ok: false, error: { code: 'teamsUncertain' } })
    expect(other).toEqual({ ok: true, id: 'sent-1' })
    expect(confirmed).toEqual({ ok: true, id: 'sent-2' })
    expect(teams.sent.map((sent) => sent.conversationId)).toEqual([
      'c1;messageid=r1',
      'c1;messageid=r1',
    ])
  })

  it('reply refuses a draft that is empty after the whitelist', async () => {
    const { teams, service } = postedRig()

    const result = await service.write.reply('MDP-1', {
      conversationId: 'c1',
      rootId: 'r1',
      draft: draft('<script>alert(1)</script><p> </p>'),
      confirm: false,
    })

    expect(result).toBe('invalid')
    expect(teams.sent).toEqual([])
  })

  it('replies in a ticket chat as a chat message', async () => {
    const { teams, service } = serviceRig(['c1'])
    teams.chats.push({ id: 'chat-1', topic: 'MDP-1 talk' })
    teams.chatThreads.set('chat-1', {
      conversationId: 'chat-1',
      rootId: '',
      messages: [],
      isChat: true,
    })

    const result = await service.write.reply('MDP-1', {
      conversationId: 'chat-1',
      rootId: null,
      draft: draft('hi'),
      confirm: false,
    })

    expect(result).toEqual({ ok: true, id: 'sent-1' })
    expect(teams.sent[0]?.conversationId).toBe('chat-1')
  })

  it('edits only my own message, a reply in its thread and the root with its key', async () => {
    const { teams, service } = postedRig()
    const edit = { conversationId: 'c1', subject: null, draft: draft('<p>new</p>') }

    const theirs = await service.write.edit('MDP-1', { ...edit, messageId: 'reply-theirs' })
    const reply = await service.write.edit('MDP-1', { ...edit, messageId: 'reply-mine' })
    const rootWithoutKey = await service.write.edit('MDP-1', {
      ...edit,
      messageId: 'r1',
      subject: 'Fix',
    })
    const root = await service.write.edit('MDP-1', {
      ...edit,
      messageId: 'r1',
      subject: 'MDP-1 Fix',
    })

    expect(theirs).toEqual({ ok: false, error: { code: 'forbidden' } })
    expect(reply).toEqual({ ok: true, id: 'reply-mine' })
    expect(rootWithoutKey).toBe('invalid')
    expect(root).toEqual({ ok: true, id: 'r1' })
    expect(teams.edits).toEqual([
      ['c1;messageid=r1', 'reply-mine', null],
      ['c1', 'r1', 'MDP-1 Fix'],
    ])
  })

  it('deleting the root drops it from the index; a reply leaves the index', async () => {
    const { teams, service, saved } = postedRig()

    await service.write.remove('MDP-1', { conversationId: 'c1', messageId: 'reply-mine' })
    const afterReply = saved.index['c1']?.posts['MDP-1']
    await service.write.remove('MDP-1', { conversationId: 'c1', messageId: 'r1' })

    expect(afterReply?.rootId).toBe('r1')
    expect(saved.index['c1']?.posts).toEqual({})
    expect(teams.deletes).toEqual([
      ['c1;messageid=r1', 'reply-mine'],
      ['c1', 'r1'],
    ])
  })

  it('reacts with a key it can take, adding or taking off my own', async () => {
    const { teams, service } = postedRig()
    teams.threads.set(
      'c1|r1',
      threadOf('c1', 'r1', teamsMessage('liked', { reactions: [{ key: 'like', userMris: [ME] }] })),
    )

    await service.write.react('MDP-1', { conversationId: 'c1', messageId: 'liked', key: 'like' })
    await service.write.react('MDP-1', { conversationId: 'c1', messageId: 'liked', key: 'heart' })
    const refused = await service.write.react('MDP-1', {
      conversationId: 'c1',
      messageId: 'liked',
      key: 'bad key',
    })

    expect(refused).toBe('invalid')
    expect(teams.reactions).toEqual([
      ['c1;messageid=r1', 'liked', 'like', false],
      ['c1;messageid=r1', 'liked', 'heart', true],
    ])
  })
})
