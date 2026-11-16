import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { BugReply, TeamsMessage, TeamsReadView } from '@workday/core'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { jsonResponse, renderWithQuery, stubFetch } from '../../testSupport.js'
import { TeamsView } from './TeamsView.js'

const REPLY: BugReply = {
  fix: {
    bugKey: 'MDP-9',
    parentKey: 'MDP-1',
    summary: 'Broken',
    description: '',
    pullRequests: [],
    draftWrittenAt: '2026-11-01T08:00:00Z',
  },
  replyHtml: '<p><span data-mention="0">@Lan</span>, fixed MDP-9</p>',
  mentions: [{ text: '@Lan', mri: '8:orgid:lan', displayName: 'Lan Pham' }],
}

const MESSAGE: TeamsMessage = {
  id: 'm1',
  senderId: '8:orgid:me',
  senderName: 'Minh Tran',
  sentAt: '2026-11-01T08:00:00Z',
  content: 'hello',
  isPlainText: true,
  subject: null,
  editedAt: null,
  mentionMris: {},
  hasFiles: false,
  reactions: [],
  rootMessageId: null,
  files: [],
}

function thread(bugReplies: readonly BugReply[]): TeamsReadView {
  return {
    state: 'thread',
    options: [{ id: 'c1', label: 'Team > Chan', kind: 'channel', posted: true }],
    conversationId: 'c1',
    thread: { conversationId: 'c1', rootId: 'm1', messages: [MESSAGE], isChat: false },
    myId: '8:orgid:me',
    people: [],
    deepLink: 'https://teams.example/l/1',
    pending: [],
    bugReplies,
  }
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn() // jsdom has none
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('TeamsBugReplyCard Use reply fills the composer with the reply and its mention', async () => {
  const fetchMock = stubFetch(() => jsonResponse(thread([REPLY])))
  renderWithQuery(<TeamsView ticket="MDP-1" conversation="" firstSession="MDP-1" visible />)
  expect(await screen.findByText('Answer QC for MDP-9')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Use reply' }))
  const editor = screen.getByRole('textbox', { name: /Team > Chan/ })
  await waitFor(() => {
    expect(editor.textContent).toBe('@Lan, fixed MDP-9')
  })
  expect(editor.querySelector('span[data-mention="0"]')).not.toBeNull()
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
})

it('a thread without bugReplies renders no bug reply card', async () => {
  stubFetch(() => jsonResponse(thread([])))
  renderWithQuery(<TeamsView ticket="MDP-1" conversation="" firstSession="MDP-1" visible />)
  expect(await screen.findByText('hello')).toBeInTheDocument()
  expect(screen.queryByText(/Answer QC for/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Use reply' })).not.toBeInTheDocument()
})
