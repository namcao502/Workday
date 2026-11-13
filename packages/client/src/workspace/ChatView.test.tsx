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

function stubChat(messages: readonly ChatMessage[]): FetchMock {
  const data: ChatData = { messages, hasMore: false, working: false }
  return stubFetch((url) =>
    url.endsWith('/chat') ? jsonResponse(data) : jsonResponse({ ok: true }),
  )
}

function posts(fetchMock: FetchMock): string[] {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([url]) => url)
}

it('folds four or more tool lines into an N steps row', async () => {
  stubChat([tool(1), tool(2), tool(3), tool(4)])
  renderWithQuery(<ChatView session="claude" wait={null} onOpenTerminal={() => undefined} />)
  expect(await screen.findByText('4 steps')).toBeInTheDocument()
})

it('Enter sends the prompt, Shift+Enter does not', async () => {
  const fetchMock = stubChat([])
  renderWithQuery(<ChatView session="claude" wait={null} onOpenTerminal={() => undefined} />)
  const box = await screen.findByRole('textbox')
  fireEvent.change(box, { target: { value: 'hello' } })
  fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
  expect(posts(fetchMock)).toEqual([])
  fireEvent.keyDown(box, { key: 'Enter' })
  await waitFor(() => {
    expect(posts(fetchMock)).toEqual(['/api/workspace/sessions/claude/prompt'])
  })
  expect(box).toHaveValue('')
})

it('shows the answer-in-terminal card on a permission wait', async () => {
  const onOpenTerminal = vi.fn()
  stubChat([])
  renderWithQuery(<ChatView session="claude" wait="permission" onOpenTerminal={onOpenTerminal} />)
  expect(await screen.findByText('Claude needs your answer in the terminal')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Open terminal' }))
  expect(onOpenTerminal).toHaveBeenCalledOnce()
})
