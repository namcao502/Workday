import { expect, it } from 'vitest'
import {
  buildReplyHtml,
  isFixCurrent,
  isFixReplied,
  replyMention,
  newestOtherMessageAt,
  parseBugFix,
  qcToTag,
  type BugFix,
} from './bugReply.js'
import type { TeamsMessage, TeamsThread } from './teamsChat.js'

const ME = '8:orgid:me'
const HELENA = '8:orgid:helena'
const MINH = '8:orgid:minh'
const DRAFT_TIME = '2026-10-16T09:00:00.000Z'
const URL_MAIN = 'https://dev.azure.com/T/MDP/_git/Portal-Angular/pullrequest/55138'
const URL_DEV = 'https://dev.azure.com/T/MDP/_git/Portal-Angular/pullrequest/55202'
const DRAFT = `MDP-9323 [Failed Test]: Style column cuts off

E fix cột Style: tên dài hiện "...".

[FE Portal]
main: ${URL_MAIN}
dev: ${URL_DEV}
`

function at(minutes: number): string {
  return new Date(Date.parse(DRAFT_TIME) + minutes * 60_000).toISOString()
}

function message(senderId: string, senderName: string, minutes: number, text: string): TeamsMessage {
  return {
    id: `${senderId}${String(minutes)}`,
    senderId,
    senderName,
    sentAt: at(minutes),
    content: `<p>${text}</p>`,
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

function thread(...messages: TeamsMessage[]): TeamsThread {
  return { conversationId: '19:c@thread.tacv2', rootId: '1', messages, isChat: false }
}

function fix(): BugFix {
  return parseBugFix('MDP-9310', 'MDP-9323', DRAFT, DRAFT_TIME)
}

it('parseBugFix reads the description and PR blocks', () => {
  const parsed = fix()
  expect(parsed.summary).toBe('MDP-9323 [Failed Test]: Style column cuts off')
  expect(parsed.description).toBe('E fix cột Style: tên dài hiện "...".')
  expect(parsed.pullRequests).toEqual([
    { block: 'FE Portal', branch: 'main', url: URL_MAIN },
    { block: 'FE Portal', branch: 'dev', url: URL_DEV },
  ])
})

it('isFixCurrent is false after 14 days or when the bug is done', () => {
  const day = 86_400_000
  const start = Date.parse(DRAFT_TIME)
  expect(isFixCurrent(fix(), 'indeterminate', new Date(start + 13 * day))).toBe(true)
  expect(isFixCurrent(fix(), 'indeterminate', new Date(start + 15 * day))).toBe(false)
  expect(isFixCurrent(fix(), 'Done', new Date(start + day))).toBe(false)
})

it('qcToTag prefers a sender with QC in the name', () => {
  const withQc = thread(
    message(ME, 'Nam', -60, 'post'),
    message(HELENA, 'Helena (DU2 - QC)', -30, 'bug'),
    message(MINH, 'Minh Dinh (Tech Leader)', -10, 'check'),
  )
  const noQc = thread(message(ME, 'Nam', -60, 'post'), message(MINH, 'Minh Dinh', -10, 'check'))
  expect(qcToTag(withQc, ME)).toEqual({ mri: HELENA, displayName: 'Helena (DU2 - QC)' })
  expect(qcToTag(noQc, ME)?.mri).toBe(MINH)
  expect(qcToTag(thread(message(ME, 'Nam', -60, 'post')), ME)).toBeNull()
})

it('newestOtherMessageAt skips my messages and non-person senders', () => {
  const t = thread(
    message(HELENA, 'Helena', -30, 'bug'),
    message(ME, 'Nam', -10, 'da'),
    message('28:bot', 'Bot', -5, 'build'),
  )
  expect(newestOtherMessageAt(t, ME)).toBe(at(-30))
  expect(newestOtherMessageAt(thread(message(ME, 'Nam', -10, 'post')), ME)).toBeNull()
})

it('isFixReplied needs my message after the draft naming the bug', () => {
  const before = thread(message(ME, 'Nam', -5, 'e sua MDP-9323'))
  const otherBug = thread(message(ME, 'Nam', 5, 'e fix MDP-9999'))
  const replied = thread(message(ME, 'Nam', 5, 'e fix bug mdp-9323 r nha'))
  const byQc = thread(message(HELENA, 'Helena', 5, 'MDP-9323 ok'))
  expect(isFixReplied(before, ME, fix())).toBe(false)
  expect(isFixReplied(otherBug, ME, fix())).toBe(false)
  expect(isFixReplied(byQc, ME, fix())).toBe(false)
  expect(isFixReplied(replied, ME, fix())).toBe(true)
})

it('buildReplyHtml tags QC and renders inline markdown', () => {
  const marked = { ...fix(), description: 'e sửa **Is Jit** cho *đơn mới*, gọi `GetX()` a * b' }
  const html = buildReplyHtml(marked, { mri: HELENA, displayName: 'Helena' })
  expect(html.startsWith('<p><span data-mention="0">@Helena</span>, dạ e fix bug MDP-9323 r nha</p>')).toBe(true)
  expect(replyMention({ mri: HELENA, displayName: 'Helena (QC)' })).toEqual({
    text: '@Helena',
    mri: HELENA,
    displayName: 'Helena (QC)',
  })
  expect(html).toContain(
    '<p>e sửa <strong>Is Jit</strong> cho <em>đơn mới</em>, gọi <code>GetX()</code> a * b</p>',
  )
  expect(html).toContain(`[FE Portal]<br>main: <a href="${URL_MAIN}">${URL_MAIN}</a><br>dev: `)
  expect(buildReplyHtml(fix(), null)).not.toContain('mention')
})

it('buildReplyHtml escapes html', () => {
  const html = buildReplyHtml({ ...fix(), description: 'a <b> & c' }, { mri: HELENA, displayName: 'Helena <QC>' })
  expect(html).toContain('>@Helena &lt;QC&gt;</span>')
  expect(html).toContain('<p>a &lt;b&gt; &amp; c</p>')
})
