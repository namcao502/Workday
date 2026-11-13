import { describe, expect, it } from 'vitest'
import {
  canReact,
  conversationKey,
  emojiUrl,
  findTicketChats,
  mentionsMe,
  parseWatchList,
  watched,
} from './teamsChat.js'
import { parseChannels, parseMessages, withoutEmoji } from './teamsParse.js'
import type { TeamsChannel, TeamsMessage } from './teamsChat.js'

function raw(
  id: string,
  content: string,
  composetime: string,
  extra: Record<string, unknown> = {},
): unknown {
  return {
    id,
    content,
    composetime,
    messagetype: 'RichText/Html',
    from: 'https://x/v1/users/ME/contacts/8:orgid:AAA',
    imdisplayname: 'Minh Dinh',
    ...extra,
  }
}

const page = (...messages: unknown[]): unknown => ({
  messages,
  _metadata: { backwardLink: 'https://older' },
})
const ids = (json: unknown): string[] => parseMessages(json).messages.map((m) => m.id)
const one = (content: string): TeamsMessage => {
  const [first] = parseMessages(page(raw('1', content, '2026-10-14T08:00:00Z'))).messages
  if (first === undefined) {
    throw new Error('message dropped')
  }
  return first
}

describe('parseChannels', () => {
  it('returns every channel with its team, skipping ones without an id', () => {
    const json = {
      teams: [
        {
          displayName: 'MDP',
          channels: [{ id: 'a', displayName: 'PR in the hole' }, { displayName: 'no id' }],
        },
        { displayName: 'Other', channels: [{ id: 'g', displayName: 'Random' }] },
        { displayName: 'No channels' },
      ],
    }
    expect(parseChannels(json)).toEqual([
      { id: 'a', teamName: 'MDP', channelName: 'PR in the hole' },
      { id: 'g', teamName: 'Other', channelName: 'Random' },
    ])
    expect(parseChannels(null)).toEqual([])
    expect(parseChannels({ teams: 'x' })).toEqual([])
  })

  it('drops emoji from names but keeps a name that is only emoji', () => {
    const json = {
      teams: [
        {
          displayName: 'MDP \u{1F680}',
          channels: [
            { id: 'a', displayName: 'PR in the hole \u{1F9CC}' },
            { id: 'b', displayName: 'Deploy \u{1F44D}\u{1F3FD} done' },
            { id: 'c', displayName: '\u{1F389}' },
            { id: 'd', displayName: 'Caf\u00e9 \u2615' },
          ],
        },
      ],
    }
    const channels = parseChannels(json)
    expect(channels[0]).toEqual({ id: 'a', teamName: 'MDP', channelName: 'PR in the hole' })
    expect(channels[1]?.channelName).toBe('Deploy done')
    expect(channels[2]?.channelName).toBe('\u{1F389}')
    expect(channels[3]?.channelName).toBe('Caf\u00e9 \u2615')
    expect(withoutEmoji('  ')).toBe('  ')
  })
})

describe('parseMessages', () => {
  it('keeps html and text messages, drops system, deleted, empty and untimed ones', () => {
    const json = page(
      raw('1', '<p>html</p>', '2026-10-14T08:00:00Z'),
      raw('2', 'plain', '2026-10-14T08:01:00Z', { messagetype: 'Text' }),
      raw('3', '<p>added</p>', '2026-10-14T08:02:00Z', { messagetype: 'ThreadActivity/AddMember' }),
      raw('4', '<p>gone</p>', '2026-10-14T08:03:00Z', {
        properties: { deletetime: '1791525886264' },
      }),
      raw('5', '', '2026-10-14T08:04:00Z'),
      raw('6', '<p>no time</p>', 'not a date'),
      raw('7', '<p>blank delete</p>', '2026-10-14T08:05:00Z', { properties: { deletetime: '' } }),
    )
    expect(ids(json)).toEqual(['1', '2', '7'])
  })

  it('parseMessages skips a malformed message and keeps the rest', () => {
    const json = page(
      null,
      42,
      'text',
      [],
      { id: 7, content: 'x' },
      raw('ok', '<p>a</p>', '2026-10-14T08:00:00Z'),
      {
        id: 'bad',
        content: '<p>x</p>',
        composetime: '2026-10-14T08:00:00Z',
        messagetype: 'Text',
        properties: 'oops',
      },
    )
    expect(ids(json)).toEqual(['ok', 'bad'])
    expect(ids({ messages: 'nope' })).toEqual([])
    expect(ids(undefined)).toEqual([])
  })

  it('sorts oldest first and returns the backward link', () => {
    const result = parseMessages(
      page(
        raw('3', '<p>c</p>', '2026-10-14T08:03:00Z'),
        raw('1', '<p>a</p>', '2026-10-14T08:01:00Z'),
      ),
    )
    expect(result.messages.map((m) => m.id)).toEqual(['1', '3'])
    expect(result.backwardLink).toBe('https://older')
    expect(parseMessages({ messages: [] }).backwardLink).toBeNull()
  })

  it('reads sender id, name, subject, sent time and plain-text flag', () => {
    const [message] = parseMessages(
      page(
        raw('1', '<p>hi</p>', '2026-10-14T08:51:07.4770000Z', {
          properties: { subject: 'MDP-9262 W' },
        }),
      ),
    ).messages
    expect(message?.senderId).toBe('8:orgid:aaa')
    expect(message?.senderName).toBe('Minh Dinh')
    expect(message?.subject).toBe('MDP-9262 W')
    expect(message?.sentAt).toBe('2026-10-14T08:51:07.477Z')
    expect(one('just words').isPlainText).toBe(true)
    expect(one('x < y and y > z').isPlainText).toBe(true)
    expect(one('line<BR>line').isPlainText).toBe(false)
  })

  it('reads edit time, person mentions and files (share link first)', () => {
    const properties = {
      edittime: '1791525886264',
      mentions: JSON.stringify([
        { itemid: '0', mri: '8:orgid:a', mentionType: 'person' },
        { itemid: 1, mri: '8:orgid:b' },
        { itemid: '2', mri: '19:channel@thread.tacv2', mentionType: 'channel' },
        { itemid: '3', mentionType: 'person' },
      ]),
      files: JSON.stringify([
        { fileName: 'a.pdf', objectUrl: 'http://x/a', fileInfo: { shareUrl: 'https://share/a' } },
        { title: 'b.txt', objectUrl: 'https://obj/b' },
        { fileName: 'c.txt', objectUrl: 'http://insecure/c' },
      ]),
    }
    const [message] = parseMessages(
      page(raw('1', '<p>x</p>', '2026-10-14T08:00:00Z', { properties })),
    ).messages
    expect(message?.editedAt).toBe(new Date(1791525886264).toISOString())
    expect(message?.mentionMris).toEqual({ '0': '8:orgid:a', '1': '8:orgid:b' })
    expect(message?.hasFiles).toBe(true)
    expect(message?.files).toEqual([
      { fileName: 'a.pdf', url: 'https://share/a' },
      { fileName: 'b.txt', url: 'https://obj/b' },
    ])
    expect(one('<p>x</p>').files).toEqual([])
  })

  it('reads reactions, skipping bad keys and empty ones', () => {
    const emotions = JSON.stringify([
      { key: 'like', users: [{ mri: '8:ORGID:A' }, { mri: '8:orgid:a' }] },
      { key: 'bad/key', users: [{ mri: '8:orgid:a' }] },
      { key: 'heart', users: [] },
    ])
    const [message] = parseMessages(
      page(raw('1', '<p>x</p>', '2026-10-14T08:00:00Z', { properties: { emotions } })),
    ).messages
    expect(message?.reactions).toEqual([{ key: 'like', userMris: ['8:orgid:a'] }])
  })
})

describe('channels and chats', () => {
  const channel = (id: string, teamName: string, channelName: string): TeamsChannel => ({
    id,
    teamName,
    channelName,
  })

  it('watched keeps the watch-list order and matches names without emoji or case', () => {
    const channels = [
      channel('general-mdp', 'MDP (Monster Digital Platform)', 'General'),
      channel('pr', 'MDP (Monster Digital Platform)', 'PR in the hole '),
      channel('alert', 'Task-MDP', 'Alert'),
      channel('general-tsc', 'tsc miami', 'general'),
      channel('db', 'MDP (Monster Digital Platform)', 'Database Review\u2692'),
      channel('emoji', 'MDP (Monster Digital Platform)', 'QC \u{1F9CC}'),
    ]
    const list = parseWatchList([
      'MDP (Monster Digital Platform) > PR in the hole',
      '  MDP (Monster Digital Platform) >  Database Review ',
      'TSC Miami > General',
      'Task-MDP > Alert',
      'MDP (Monster Digital Platform) > QC',
      'broken line',
      ' > ',
    ])
    expect(list).toHaveLength(5)
    expect(watched(channels, list).map((c) => c.id)).toEqual([
      'pr',
      'db',
      'general-tsc',
      'alert',
      'emoji',
    ])
    expect(watched([channel('x', 'Other', 'General')], list)).toEqual([])
  })

  it('findTicketChats matches a topic starting with the key, not a longer key or a middle match', () => {
    const chats = [
      { id: 'a', topic: 'mdp-1 widget' },
      { id: 'b', topic: 'MDP-10 other' },
      { id: 'c', topic: 'see MDP-1' },
      { id: 'd', topic: '  MDP-1' },
      { id: 'a', topic: 'MDP-1 dup' },
    ]
    expect(findTicketChats(chats, 'MDP-1').map((c) => c.id)).toEqual(['a', 'd'])
  })

  it('conversationKey tells a chat from a post', () => {
    expect(conversationKey('MDP-1', '19:chat@thread.v2', null)).toBe('MDP-1|19:chat@thread.v2')
    expect(conversationKey('MDP-1', '19:c@thread.tacv2', '123')).toBe(
      'MDP-1|19:c@thread.tacv2;messageid=123',
    )
  })

  it('mentionsMe compares the mri ignoring case', () => {
    const message = { ...one('<p>x</p>'), mentionMris: { '0': '8:ORGID:ME' } }
    expect(mentionsMe(message, '8:orgid:me')).toBe(true)
    expect(mentionsMe(message, '8:orgid:you')).toBe(false)
    expect(mentionsMe(one('<p>x</p>'), '8:orgid:me')).toBe(false)
  })

  it('canReact takes a quick key or one the message has, nothing else', () => {
    const message = { ...one('<p>x</p>'), reactions: [{ key: 'custom_1', userMris: ['a'] }] }
    expect(canReact(message, 'like')).toBe(true)
    expect(canReact(message, 'custom_1')).toBe(true)
    expect(canReact(message, 'wow')).toBe(false)
    expect(canReact(message, '../x')).toBe(false)
    expect(canReact(message, 'like\n')).toBe(false)
  })

  it('emojiUrl points at the Teams CDN and draws like as yes', () => {
    expect(emojiUrl('heart')).toBe(
      'https://statics.teams.cdn.office.net/evergreen-assets/personal-expressions/v2/assets/emoticons/heart/default/30_f.png',
    )
    expect(emojiUrl('like')).toContain('/emoticons/yes/default/')
  })
})
