import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ChatMessage, ChatView as ChatData } from '@workday/core'
import { afterEach, expect, it, vi } from 'vitest'
import { jsonResponse, renderWithQuery, stubFetch, type FetchMock } from '../testSupport.js'
import { ChatView } from './ChatView.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

function tool(id: number): ChatMessage {
  return {
    id,
    role: 'tool',
    text: null,
    toolName: 'Read',
    toolDetail: `f${String(id)}.ts`,
    isError: false,
    at: null,
    status: null,
  }
}

function chatData(overrides: Partial<ChatData> = {}): ChatData {
  return {
    messages: [],
    hasMore: false,
    working: false,
    requests: [],
    running: false,
    mode: 'default',
    model: null,
    ...overrides,
  }
}

function stubChat(
  overrides: Partial<ChatData> = {},
  post: () => Response = () => jsonResponse({ ok: true }),
): FetchMock {
  return stubFetch((_url, init) =>
    init?.method === 'POST' ? post() : jsonResponse(chatData(overrides)),
  )
}

function posts(fetchMock: FetchMock): { url: string; body: unknown }[] {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([url, init]) => ({
      url,
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    }))
}

it('folds four or more tool lines into an N steps row', async () => {
  stubChat({ messages: [tool(1), tool(2), tool(3), tool(4)] })
  renderWithQuery(<ChatView session="claude" />)
  expect(await screen.findByText('4 steps')).toBeInTheDocument()
})

it('the chat shows transcript rows and a permission card that allows', async () => {
  const fetchMock = stubChat({
    messages: [
      { ...tool(1), role: 'user', text: 'fix it', toolName: null, toolDetail: null },
      { ...tool(2), role: 'assistant', text: 'On it', toolName: null, toolDetail: null },
      tool(3),
    ],
    requests: [
      {
        id: 'r1',
        kind: 'permission',
        toolName: 'Bash',
        detail: 'npm test',
        questions: [],
        canAlwaysAllow: false,
      },
    ],
  })
  renderWithQuery(<ChatView session="claude" />)
  expect(await screen.findByText('fix it')).toBeInTheDocument()
  expect(screen.getByText('On it')).toBeInTheDocument()
  expect(screen.getByText('f3.ts', { exact: false })).toBeInTheDocument()
  expect(screen.getByText('Claude wants to use Bash')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
  await waitFor(() => {
    expect(posts(fetchMock)).toEqual([
      { url: '/api/workspace/sessions/claude/requests/r1', body: { kind: 'allow', always: false } },
    ])
  })
})

it('Enter sends the prompt, Shift+Enter adds a line', async () => {
  const fetchMock = stubChat()
  renderWithQuery(<ChatView session="claude" />)
  const box = await screen.findByRole('textbox', { name: 'Message to Claude' })
  fireEvent.change(box, { target: { value: 'hello' } })
  fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
  expect(posts(fetchMock)).toEqual([])
  fireEvent.keyDown(box, { key: 'Enter' })
  await waitFor(() => {
    expect(posts(fetchMock)).toEqual([
      { url: '/api/workspace/sessions/claude/prompt', body: { text: 'hello' } },
    ])
  })
  expect(box).toHaveValue('')
})

it('Stop shows while working and calls interrupt', async () => {
  const fetchMock = stubChat({ working: true })
  renderWithQuery(<ChatView session="claude" />)
  expect(await screen.findByText('Working...')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
  await waitFor(() => {
    expect(posts(fetchMock).map((post) => post.url)).toEqual([
      '/api/workspace/sessions/claude/interrupt',
    ])
  })
})

it('changing the mode posts it', async () => {
  const fetchMock = stubChat({ model: 'claude-opus' })
  renderWithQuery(<ChatView session="claude" />)
  expect(await screen.findByText('claude-opus')).toBeInTheDocument()
  fireEvent.click(await screen.findByRole('button', { name: /Permission mode/ }))
  fireEvent.click(await screen.findByRole('option', { name: 'Plan' }))
  await waitFor(() => {
    expect(posts(fetchMock)).toEqual([
      { url: '/api/workspace/sessions/claude/mode', body: { mode: 'plan' } },
    ])
  })
})

it('a 409 on send shows the start error text', async () => {
  stubChat({}, () => jsonResponse({ ok: false, error: { code: 'worktreeMissing' } }, 409))
  renderWithQuery(<ChatView session="claude" />)
  const box = await screen.findByRole('textbox', { name: 'Message to Claude' })
  fireEvent.change(box, { target: { value: 'hello' } })
  fireEvent.keyDown(box, { key: 'Enter' })
  expect(await screen.findByText('The ticket has no worktree yet')).toBeInTheDocument()
})
