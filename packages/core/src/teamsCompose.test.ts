import { describe, expect, it } from 'vitest'
import type { TeamsMessage, TeamsThread } from './teamsChat.js'
import {
  buildBody,
  isEditable,
  isEmptyHtml,
  paragraphsFromText,
  people,
  shortName,
} from './teamsCompose.js'
import type { TeamsMention } from './teamsCompose.js'

const MINH = '8:orgid:11111111-2222-3333-4444-555555555555'
const LAN = '8:orgid:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const MENTION_TYPE = 'http://schema.skype.com/Mention'
const NBSP = String.fromCharCode(160)

function message(senderId: string, senderName: string, sentAt: string): TeamsMessage {
  return {
    id: `${senderId}${sentAt}`,
    senderId,
    senderName,
    sentAt,
    content: '<p>x</p>',
    isPlainText: false,
    subject: null,
    editedAt: null,
    mentionMris: {},
    hasFiles: false,
    reactions: [],
    rootMessageId: null,
    files: [],
  }
}

function thread(messages: readonly TeamsMessage[]): TeamsThread {
  return { conversationId: 'c', rootId: 'r', messages, isChat: false }
}

function build(html: string, ...mentions: TeamsMention[]): string | undefined {
  return buildBody({ html, mentions })?.html
}

function span(itemId: number, text: string): string {
  return `<span itemtype="${MENTION_TYPE}" itemscope itemid="${String(itemId)}">${text}</span>`
}

describe('shortName', () => {
  it('drops a trailing parenthesis', () => {
    expect(shortName('Minh Dinh (Monster Digital)')).toBe('Minh Dinh')
    expect(shortName('Nam  (Ext)  ')).toBe('Nam')
  })

  it('keeps a name without one', () => {
    expect(shortName('Minh Dinh')).toBe('Minh Dinh')
    expect(shortName('(Ext)')).toBe('(Ext)')
  })
})

describe('people', () => {
  it('dedupes by sender, newest name first, without me or bots, then adds the known', () => {
    const myId = '8:orgid:5765aa42-84c5-43d9-9bf3-08cee75de0a4'
    const messages = [
      message(MINH, 'Minh Old', '2026-10-14T08:00:00Z'),
      message(LAN, 'Lan', '2026-10-14T09:00:00Z'),
      message(MINH, 'Minh New', '2026-10-14T10:00:00Z'),
      message(myId, 'Me', '2026-10-14T11:00:00Z'),
      message('28:bot-id', 'Some Bot', '2026-10-14T12:00:00Z'),
      message('8:orgid:99999999-2222-3333-4444-555555555555', '', '2026-10-14T13:00:00Z'),
    ]
    const known = [
      { mri: MINH, displayName: 'Minh Stale' },
      { mri: '8:orgid:bbbbbbbb-2222-3333-4444-555555555555', displayName: 'Known Only' },
    ]

    expect(people([thread(messages.slice(0, 3)), thread(messages.slice(3))], known, myId)).toEqual([
      { mri: MINH, displayName: 'Minh New' },
      { mri: LAN, displayName: 'Lan' },
      { mri: '8:orgid:bbbbbbbb-2222-3333-4444-555555555555', displayName: 'Known Only' },
    ])
  })
})

describe('buildBody', () => {
  it('keeps allowed formatting and strips styles, scripts and unknown tags', () => {
    const html =
      '<p style="color:red" onclick="x()">a <strong>b</strong> <em>c</em></p><script>alert(1)</script><h1>head</h1><div>d</div>' +
      '<a href="https://x.io/y?a=1&amp;b=2" target="_blank">link</a><ul><li>one</li></ul><br>'

    expect(buildBody({ html, mentions: [] })).toEqual({
      html:
        '<p>a <strong>b</strong> <em>c</em></p>head<p>d</p>' +
        '<a href="https://x.io/y?a=1&amp;b=2" title="https://x.io/y?a=1&amp;b=2">link</a><ul><li>one</li></ul><br>',
      mentionsJson: null,
    })
  })

  it('escapes text and closes unbalanced tags', () => {
    expect(build('<p>a &lt; b <b>bold')).toBe('<p>a &lt; b <b>bold</b></p>')
  })

  it('turns mention markers into Teams mentions, in order', () => {
    const body = buildBody({
      html:
        '<p>Hi <span data-mention="1">Lan</span> and <span data-mention="0">Minh</span> <span data-mention="9">x</span> ' +
        '<span data-mention="2">Bot</span> <span data-mention="0">Minh</span></p>',
      mentions: [
        { text: 'Minh', mri: MINH, displayName: 'Minh Dinh' },
        { text: 'Lan', mri: LAN, displayName: 'Lan Tran' },
        { text: 'Bot', mri: '28:bot', displayName: 'Bot' },
      ],
    })

    expect(body?.html).toBe(
      `<p>Hi ${span(0, 'Lan')} and ${span(1, 'Minh')} x Bot ${span(2, 'Minh')}</p>`,
    )
    const json = JSON.parse(body?.mentionsJson ?? '[]') as Record<string, string>[]
    expect(json.map((mention) => mention.mri)).toEqual([LAN, MINH, MINH])
    expect(json[1]).toEqual({
      '@type': MENTION_TYPE,
      itemid: '1',
      mri: MINH,
      mentionType: 'person',
      displayName: 'Minh Dinh',
    })
  })

  it('drops a mention whose index has no person mri', () => {
    const bot = { text: 'Bot', mri: '28:bot', displayName: 'Bot' }

    const body = buildBody({
      html: '<p><span data-mention="0">Bot</span><span data-mention="5">Gone</span><span>Plain</span></p>',
      mentions: [bot],
    })

    expect(body).toEqual({ html: '<p>BotGonePlain</p>', mentionsJson: null })
  })

  it('keeps only http links and the editable tags', () => {
    const html =
      '<p><a href="javascript:alert(1)">click</a> <a href="  https://ok.io ">ok</a> <a>none</a> ' +
      '<a href="data:text/html,x">d</a> <img src="x" onerror="y()"><table><tr><td>cell</td></tr></table>' +
      '<iframe src="x">hidden</iframe><span style="x">s</span></p>'

    expect(build(html)).toBe(
      '<p>click <a href="https://ok.io" title="https://ok.io">ok</a> none d cells</p>',
    )
  })

  it('returns null when nothing is left after the whitelist', () => {
    expect(buildBody({ html: '<script>x()</script><img src="a">', mentions: [] })).toBeNull()
    expect(buildBody({ html: '<p><br></p><p>&nbsp; </p>', mentions: [] })).toBeNull()
  })

  it('drops trailing empty paragraphs only', () => {
    expect(build('<p>a</p><pre>x</pre><p><br></p><p></p>')).toBe('<p>a</p><pre>x</pre>')
    expect(build('<p><br></p><p>a</p>')).toBe('<p><br></p><p>a</p>')
  })

  it('writes a non-breaking space as an entity only inside a pre', () => {
    expect(build(`<pre>a${NBSP}b</pre><p>c&nbsp;d</p>`)).toBe(`<pre>a&nbsp;b</pre><p>c${NBSP}d</p>`)
  })
})

describe('isEmptyHtml', () => {
  it.each([
    ['', true],
    ['<p><br></p>', true],
    ['<p>&nbsp; </p><p></p>', true],
    ['<p>x</p>', false],
  ])('%j is %s', (html, expected) => {
    expect(isEmptyHtml(html)).toBe(expected)
  })
})

describe('paragraphsFromText', () => {
  it('writes one paragraph per line with clickable links', () => {
    expect(paragraphsFromText('a & b\r\n\r\nsee https://x.io/y.')).toBe(
      '<p>a &amp; b</p><p><br></p><p>see <a href="https://x.io/y">https://x.io/y</a>.</p>',
    )
  })
})

describe('isEditable', () => {
  const edit = (content: string, extra: Partial<TeamsMessage> = {}): boolean =>
    isEditable({ ...message(MINH, 'x', '2026-10-14T08:00:00Z'), content, ...extra })

  it('accepts kept tags, plain text and a mention with an mri', () => {
    expect(edit('<p>a <b>b</b><br><a href="https://x.io">l</a></p>')).toBe(true)
    expect(edit('anything', { isPlainText: true })).toBe(true)
    expect(edit(`<p>${span(0, 'Minh')}</p>`, { mentionMris: { '0': MINH } })).toBe(true)
  })

  it('rejects files, other tags, images and a mention without an mri', () => {
    expect(edit('<p>a</p>', { hasFiles: true })).toBe(false)
    expect(edit('<table><tr><td>x</td></tr></table>')).toBe(false)
    expect(edit('<p><img src="x"></p>')).toBe(false)
    expect(edit(`<p>${span(0, 'Minh')}</p>`)).toBe(false)
    expect(edit('<p><span>plain</span></p>')).toBe(false)
  })
})

describe('buildBody on hostile input stays linear', () => {
  // Growth is compared, not wall-clock: quadratic work grows ~16x from n to 4n, linear ~4x.
  const fastestMs = (run: () => void): number => {
    let fastest = Number.POSITIVE_INFINITY
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const started = performance.now()
      run()
      fastest = Math.min(fastest, performance.now() - started)
    }
    return fastest
  }
  const inputs: Record<string, (count: number) => string> = {
    'an unclosed quote': (count) => '<a href="'.repeat(count),
    'many unmatched closing tags': (count) => '<span>'.repeat(count) + '</p>'.repeat(count),
    'many unterminated mention spans': (count) => '<span data-mention="0">'.repeat(count),
    'many empty paragraphs': (count) => '<p></p>'.repeat(count),
    'many unterminated scripts': (count) => '<script>'.repeat(count),
    'a long space run': (count) => `<p>a${' '.repeat(count * 10)}b</p>`,
  }

  it.each(Object.entries(inputs))('stays linear on %s', (_name, build) => {
    const mentions = [{ text: 'M', mri: MINH, displayName: 'M' }]
    const small = fastestMs(() => buildBody({ html: build(5_000), mentions }))
    const large = fastestMs(() => buildBody({ html: build(20_000), mentions }))
    expect(large).toBeLessThan(small * 10 + 50)
    expect(large).toBeLessThan(2_000)
  })
})
