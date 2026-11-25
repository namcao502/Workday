import { describe, expect, it } from 'vitest'
import type { DbReviewApproval } from './api.js'
import {
  dbReviewDue,
  endsWithApproval,
  isApproval,
  isDbReviewChannel,
  pendingApproval,
  sqlOf,
} from './dbReview.js'
import type { TeamsMessage, TeamsThread } from './teams/teamsChat.js'

const ME = '8:orgid:me'
const LEAD = '8:orgid:lead'
const START = Date.parse('2026-10-19T04:00:00.000Z')
const ROOT_SQL =
  '<p>a lead</p><p itemtype="x">&nbsp;</p>' +
  '<pre class="language-sql"><code><span class="k">ALTER</span> TABLE dbo.MdBin<br>' +
  '&nbsp;ADD IsJitTemp BIT NOT NULL;<br>-- a &lt; b</code></pre>'
const ROOT_SQL_TEXT = 'ALTER TABLE dbo.MdBin\n ADD IsJitTemp BIT NOT NULL;\n-- a < b'

function message(id: string, senderId: string, minutes: number, content: string, isPlain = false) {
  const result: TeamsMessage = {
    id,
    senderId,
    senderName: senderId === ME ? 'Me' : 'Minh Dinh',
    sentAt: new Date(START + minutes * 60_000).toISOString(),
    content,
    isPlainText: isPlain,
    subject: null,
    editedAt: null,
    mentionMris: {},
    hasFiles: false,
    reactions: [],
    rootMessageId: 'root',
    files: [],
  }
  return result
}

function thread(...messages: TeamsMessage[]): TeamsThread {
  return { conversationId: 'db', rootId: 'root', messages, isChat: false }
}

const plain = (id: string, sender: string, minutes: number, text: string): TeamsMessage =>
  message(id, sender, minutes, text, true)

describe('isApproval', () => {
  it('isApproval_accepts_approve_appr_and_ok_prefix', () => {
    for (const text of [
      'approve',
      'Approve',
      'appr',
      'approved nha e',
      'ok approve',
      'Ok, approve nha e',
      'oke approved',
    ]) {
      expect(isApproval(plain('r', LEAD, 1, text)), text).toBe(true)
    }
  })

  it('isApproval_ignores_approve_in_the_middle', () => {
    for (const text of [
      'approach this differently',
      'ok',
      'chua approve duoc, doi ten cot',
      'NVARCHAR => VARCHAR nha e',
    ]) {
      expect(isApproval(plain('r', LEAD, 1, text)), text).toBe(false)
    }
  })
})

describe('sqlOf', () => {
  it('sqlOf_joins_code_blocks', () => {
    expect(sqlOf(message('root', ME, 0, ROOT_SQL))).toBe(ROOT_SQL_TEXT)
    const two = message('r', ME, 1, '<pre>A</pre><p>x</p><pre> </pre><pre>B</pre>')
    expect(sqlOf(two)).toBe('A\n\nB')
  })

  it('sqlOf_returns_null_for_plain_text', () => {
    expect(sqlOf(message('r1', ME, 1, '<p>e update r a</p>'))).toBeNull()
    expect(sqlOf(plain('r2', ME, 1, '<pre>A</pre>'))).toBeNull()
  })
})

describe('pendingApproval', () => {
  it('pendingApproval_needs_my_root_post', () => {
    const others = thread(message('root', LEAD, 0, ROOT_SQL), plain('r1', ME, 5, 'approve'))
    expect(pendingApproval(others, 'MDP-1', 'k', ME)).toBeNull()
    const mine = thread(message('root', ME, 0, ROOT_SQL), plain('r1', LEAD, 5, 'approve'))
    expect(pendingApproval(mine, 'MDP-1', 'k', ME)).toEqual({
      ticketKey: 'MDP-1',
      conversationKey: 'k',
      channelId: 'db',
      approverName: 'Minh Dinh',
      approvedAt: mine.messages[1]?.sentAt,
      sql: ROOT_SQL_TEXT,
    })
  })

  it('pendingApproval_takes_the_first_approval_after_the_newest_sql', () => {
    const first = thread(
      message('root', ME, 0, ROOT_SQL),
      plain('r1', LEAD, 5, 'approve'),
      plain('r2', 'other', 9, 'approved'),
    )
    expect(pendingApproval(first, 'MDP-1', 'k', ME)?.approvedAt).toBe(first.messages[1]?.sentAt)
    const newSql = thread(
      message('root', ME, 0, ROOT_SQL),
      plain('r1', LEAD, 5, 'approve'),
      message('r2', ME, 60, '<pre>CREATE TABLE dbo.X (Id INT)</pre>'),
    )
    expect(pendingApproval(newSql, 'MDP-1', 'k', ME)).toBeNull()
  })

  it('pendingApproval_covers_only_sql_since_the_previous_approval', () => {
    const t = thread(
      message('root', ME, 0, ROOT_SQL),
      plain('r1', LEAD, 5, 'approve'),
      message('r2', ME, 60, '<pre>SQL2</pre>'),
      message('r3', ME, 61, '<pre>SQL3</pre>'),
      plain('r4', LEAD, 70, 'approve'),
    )
    expect(pendingApproval(t, 'MDP-1', 'k', ME)?.sql).toBe('SQL2\n\nSQL3')
    const withRoot = thread(
      message('root', ME, 0, ROOT_SQL),
      message('r1', ME, 2, '<pre>SQL2</pre>'),
      plain('r2', ME, 3, 'e update r a'),
      plain('r3', LEAD, 5, 'approve'),
    )
    expect(pendingApproval(withRoot, 'MDP-1', 'k', ME)?.sql).toBe(`${ROOT_SQL_TEXT}\n\nSQL2`)
  })
})

describe('dbReviewDue', () => {
  const approval: DbReviewApproval = {
    ticketKey: 'MDP-1',
    conversationKey: 'k',
    channelId: 'db',
    approverName: 'Lead',
    approvedAt: new Date(START + 5 * 60_000).toISOString(),
    sql: 'SQL',
  }
  const at = (minutes: number): string => new Date(START + minutes * 60_000).toISOString()

  it('dbReviewDue_false_once_done', () => {
    expect(dbReviewDue(approval, null, at(5))).toEqual({ isTodo: false, isNotice: false })
  })

  it('dbReviewDue_notice_only_for_a_new_approval', () => {
    expect(dbReviewDue(approval, null, null)).toEqual({ isTodo: true, isNotice: true })
    expect(dbReviewDue(approval, at(5), null)).toEqual({ isTodo: true, isNotice: false })
    expect(dbReviewDue(approval, at(4), null)).toEqual({ isTodo: true, isNotice: true })
  })
})

describe('endsWithApproval', () => {
  it('endsWithApproval_false_when_i_spoke_last', () => {
    const approved = thread(message('root', ME, 0, ROOT_SQL), plain('r1', LEAD, 5, 'approve'))
    const answered = thread(...approved.messages, plain('r2', ME, 6, 'thanks'))
    const self = thread(message('root', ME, 0, ROOT_SQL), plain('r1', ME, 5, 'approve'))
    expect(endsWithApproval(approved, ME)).toBe(true)
    expect(endsWithApproval(answered, ME)).toBe(false)
    expect(endsWithApproval(self, ME)).toBe(false)
  })
})

describe('isDbReviewChannel', () => {
  const channel = { id: 'c', teamName: ' MDP Team ', channelName: 'Database Review' }

  it('compares names trimmed and case-insensitive; null config never matches', () => {
    expect(
      isDbReviewChannel(channel, { teamName: 'mdp team', channelName: 'database review ' }),
    ).toBe(true)
    expect(isDbReviewChannel(channel, { teamName: 'mdp team', channelName: 'other' })).toBe(false)
    expect(isDbReviewChannel(channel, null)).toBe(false)
  })
})
