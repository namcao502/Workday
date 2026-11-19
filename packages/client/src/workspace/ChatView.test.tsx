import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ChatMessage, ChatView as ChatData } from '@workday/core'
import { afterEach, expect, it, vi } from 'vitest'
import { jsonResponse, renderWithQuery, stubFetch, type FetchMock } from '../testSupport.js'
import { ChatView } from './ChatView.js'
import { OPEN_FILE_EVENT } from './fileLinks.js'

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
    uuid: null,
    status: null,
    output: null,
    edit: null,
    todos: null,
  }
}

function chatData(overrides: Partial<ChatData> = {}): ChatData {
  return {
    messages: [],
    hasMore: false,
    working: false,
    background: [],
    requests: [],
    running: false,
    mode: 'default',
    model: null,
    contextTokens: null,
    branch: null,
    added: 0,
    removed: 0,
    usage: null,
    catalog: null,
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
  renderWithQuery(<ChatView session="claude" tabId="claude" />)
  expect(await screen.findByText('4 steps')).toBeInTheDocument()
})

it('a background task left running after the turn shows a spinner with its name', async () => {
  stubChat({
    messages: [tool(1)],
    running: true,
    background: ['Independent plan review: plan.md'],
  })
  renderWithQuery(<ChatView session="claude" tabId="claude" />)
  const status = await screen.findByRole('status', { name: 'Running in the background' })
  expect(status).toHaveTextContent('Independent plan review: plan.md')
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
  renderWithQuery(<ChatView session="claude" tabId="claude" />)
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
  renderWithQuery(<ChatView session="claude" tabId="claude" />)
  const box = await screen.findByRole('textbox', { name: 'Message to Claude' })
  fireEvent.change(box, { target: { value: 'hello' } })
  fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
  expect(posts(fetchMock)).toEqual([])
  fireEvent.keyDown(box, { key: 'Enter' })
  await waitFor(() => {
    expect(posts(fetchMock)).toEqual([
      { url: '/api/workspace/sessions/claude/prompt', body: { text: 'hello', images: [] } },
    ])
  })
  expect(box).toHaveValue('')
})

it('Stop shows while working and calls interrupt', async () => {
  const fetchMock = stubChat({ working: true })
  renderWithQuery(<ChatView session="claude" tabId="claude" />)
  expect(await screen.findByLabelText('Working...')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Queue' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
  await waitFor(() => {
    expect(posts(fetchMock).map((post) => post.url)).toEqual([
      '/api/workspace/sessions/claude/interrupt',
    ])
  })
})

it('shows no permission mode picker', async () => {
  stubChat({ model: 'claude-opus' })
  renderWithQuery(<ChatView session="claude" tabId="claude" />)
  expect(await screen.findByText('claude-opus')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Permission mode/ })).not.toBeInTheDocument()
})

it('a 409 on send shows the start error text', async () => {
  stubChat({}, () => jsonResponse({ ok: false, error: { code: 'worktreeMissing' } }, 409))
  renderWithQuery(<ChatView session="claude" tabId="claude" />)
  const box = await screen.findByRole('textbox', { name: 'Message to Claude' })
  fireEvent.change(box, { target: { value: 'hello' } })
  fireEvent.keyDown(box, { key: 'Enter' })
  expect(await screen.findByText('The ticket has no worktree yet')).toBeInTheDocument()
})

it('says so when there is no conversation yet', async () => {
  stubChat({})
  renderWithQuery(<ChatView session="claude" tabId="claude" />)
  expect(await screen.findByText(/No conversation yet/)).toBeInTheDocument()
})

it('says Claude is starting while a session with no messages runs', async () => {
  stubChat({ running: true })
  renderWithQuery(<ChatView session="claude" tabId="claude" />)
  expect(await screen.findByText('Claude is starting...')).toBeInTheDocument()
})

it('marks history shown before Claude has started as an earlier session', async () => {
  stubChat({ messages: [tool(1)] })
  renderWithQuery(<ChatView session="claude" tabId="claude" />)
  expect(await screen.findByText(/history of an earlier session/)).toBeInTheDocument()
})

it('shows no earlier-session note while Claude runs', async () => {
  stubChat({ messages: [tool(1)], running: true })
  renderWithQuery(<ChatView session="claude" tabId="claude" />)
  expect(await screen.findByText('f1.ts')).toBeInTheDocument()
  expect(screen.queryByText(/history of an earlier session/)).not.toBeInTheDocument()
})

it('shows model, branch, changed lines and tokens under the composer', async () => {
  stubChat({
    model: 'claude-sonnet-5-5',
    branch: 'MDP-1',
    added: 947,
    removed: 117,
    contextTokens: 75500,
  })
  renderWithQuery(<ChatView session="MDP-1" tabId="MDP-1" />)
  expect(await screen.findByText('claude-sonnet-5-5')).toBeInTheDocument()
  expect(screen.getByText('MDP-1')).toBeInTheDocument()
  expect(screen.getByText('+947')).toBeInTheDocument()
  expect(screen.getByText('-117')).toBeInTheDocument()
  expect(screen.getByText('75.5K')).toBeInTheDocument()
})

it('shows the context percent and the plan usage with its reset', async () => {
  stubChat({
    contextTokens: 75500,
    usage: {
      contextPercent: 7.2,
      usage: { percent: 92, resetsAt: '2030-01-01T10:00:00Z' },
    },
  })
  renderWithQuery(<ChatView session="MDP-1" tabId="MDP-1" />)
  expect(await screen.findByText(/\(7%\)/)).toBeInTheDocument()
  expect(screen.getByText('92%')).toHaveClass('text-danger')
  expect(screen.getByText(/\(resets /)).toBeInTheDocument()
})

it('expands an Edit to its diff and shows a TodoWrite as a checklist', async () => {
  const base = tool(1)
  stubChat({
    messages: [
      {
        ...base,
        toolName: 'Edit',
        edit: { oldText: 'old line', newText: 'new line' },
        output: 'done',
      },
      {
        ...tool(2),
        toolName: 'TodoWrite',
        todos: [
          { text: 'first', status: 'completed' },
          { text: 'second', status: 'in_progress' },
        ],
      },
    ],
  })
  renderWithQuery(<ChatView session="MDP-1" tabId="MDP-1" />)
  expect(await screen.findByText('second')).toBeInTheDocument()
  expect(screen.queryByText('new line')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
  expect(screen.getByText('new line')).toBeInTheDocument()
  expect(screen.getByText('old line')).toBeInTheDocument()
  expect(screen.getByText('done')).toBeInTheDocument()
})

it('a message typed while Claude works is sent as a queued prompt', async () => {
  const fetchMock = stubChat({ working: true })
  renderWithQuery(<ChatView session="claude" tabId="claude" />)
  const box = await screen.findByRole('textbox', { name: 'Message to Claude' })
  fireEvent.change(box, { target: { value: 'and also this' } })
  fireEvent.keyDown(box, { key: 'Enter' })
  await waitFor(() => {
    expect(posts(fetchMock).map((post) => post.url)).toEqual([
      '/api/workspace/sessions/claude/prompt',
    ])
  })
})

const CATALOG = {
  models: [
    { value: 'opus', label: 'Opus' },
    { value: 'sonnet', label: 'Sonnet' },
  ],
  commands: [
    { name: 'ship', description: 'Run the ticket flow', hint: '<key>' },
    { name: 'compact', description: 'Summarize the conversation', hint: '' },
  ],
}

it('switches the model from the menu under the composer', async () => {
  const fetchMock = stubChat({ model: 'claude-opus-5-5', catalog: CATALOG })
  renderWithQuery(<ChatView session="claude" tabId="claude" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Switch model' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Sonnet' }))
  await waitFor(() => {
    expect(posts(fetchMock).map((post) => post.url)).toEqual([
      '/api/workspace/sessions/claude/model',
    ])
  })
})

it('suggests slash commands and completes one with Tab', async () => {
  stubChat({ catalog: CATALOG })
  renderWithQuery(<ChatView session="claude" tabId="claude" />)
  const box = await screen.findByRole('textbox', { name: 'Message to Claude' })
  await screen.findByRole('textbox', { name: 'Message to Claude' })
  await waitFor(() => {
    fireEvent.change(box, { target: { value: '/sh', selectionStart: 3 } })
    expect(screen.getByRole('option', { name: /\/ship <key>/ })).toBeInTheDocument()
  })
  expect(screen.queryByRole('option', { name: /compact/ })).not.toBeInTheDocument()
  fireEvent.keyDown(box, { key: 'Tab' })
  expect(box).toHaveValue('/ship ')
})

it('pastes an image, shows it, and sends it with the prompt', async () => {
  const fetchMock = stubChat()
  renderWithQuery(<ChatView session="claude" tabId="claude" />)
  const box = await screen.findByRole('textbox', { name: 'Message to Claude' })
  const file = new File(['png-bytes'], 'shot.png', { type: 'image/png' })
  fireEvent.paste(box, { clipboardData: { files: [file] } })
  expect(await screen.findByRole('img', { name: 'Pasted image' })).toBeInTheDocument()
  fireEvent.keyDown(box, { key: 'Enter' })
  await waitFor(() => {
    expect(posts(fetchMock)).toHaveLength(1)
  })
  const post = posts(fetchMock)[0]
  expect(post?.url).toBe('/api/workspace/sessions/claude/prompt')
  expect(post?.body).toMatchObject({ images: [{ mediaType: 'image/png' }] })
})

it('previews a rewind, asks first, and only then puts the files back', async () => {
  const fetchMock = stubFetch((url, init) => {
    if (init?.method === 'POST') {
      return jsonResponse({ canRewind: true, error: null, files: 3, insertions: 10, deletions: 2 })
    }
    return jsonResponse(
      chatData({
        running: true,
        messages: [
          {
            ...tool(1),
            role: 'user',
            text: 'fix it',
            toolName: null,
            toolDetail: null,
            uuid: 'u-1',
          },
        ],
      }),
    )
  })
  renderWithQuery(<ChatView session="claude" tabId="claude" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Rewind files to here' }))
  expect(await screen.findByText(/Put 3 file\(s\) back/)).toBeInTheDocument()
  expect(posts(fetchMock).map((post) => post.body)).toEqual([{ messageId: 'u-1', dryRun: true }])
  fireEvent.click(screen.getByRole('button', { name: 'Rewind' }))
  await waitFor(() => {
    expect(posts(fetchMock).map((post) => post.body)).toEqual([
      { messageId: 'u-1', dryRun: true },
      { messageId: 'u-1', dryRun: false },
    ])
  })
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

it('offers no rewind while Claude is not running', async () => {
  stubChat({
    messages: [
      { ...tool(1), role: 'user', text: 'fix it', toolName: null, toolDetail: null, uuid: 'u-1' },
    ],
  })
  renderWithQuery(<ChatView session="claude" tabId="claude" />)
  expect(await screen.findByText('fix it')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Rewind files to here' })).not.toBeInTheDocument()
})

function userMessage(id: number, text: string): ChatMessage {
  return { ...tool(id), role: 'user', text, toolName: null, toolDetail: null }
}

it('Up in the empty box recalls earlier prompts, Down comes back to the draft', async () => {
  stubChat({ messages: [userMessage(1, 'first'), userMessage(2, 'second')] })
  renderWithQuery(<ChatView session="claude" tabId="claude" />)
  const box = await screen.findByRole<HTMLTextAreaElement>('textbox', {
    name: 'Message to Claude',
  })
  await screen.findByText('second')
  fireEvent.change(box, { target: { value: 'draft' } })
  box.setSelectionRange(0, 0)
  fireEvent.keyDown(box, { key: 'ArrowUp' })
  expect(box).toHaveValue('second')
  box.setSelectionRange(0, 0)
  fireEvent.keyDown(box, { key: 'ArrowUp' })
  expect(box).toHaveValue('first')
  fireEvent.keyDown(box, { key: 'ArrowDown' })
  expect(box).toHaveValue('second')
  fireEvent.keyDown(box, { key: 'ArrowDown' })
  expect(box).toHaveValue('draft')
})

it('shows a sent prompt at once, before the transcript has it', async () => {
  stubChat()
  renderWithQuery(<ChatView session="claude" tabId="claude" />)
  const box = await screen.findByRole('textbox', { name: 'Message to Claude' })
  fireEvent.change(box, { target: { value: 'hello there' } })
  fireEvent.keyDown(box, { key: 'Enter' })
  expect(await screen.findByText('hello there')).toBeInTheDocument()
})

it('the clear button empties the box, and the spinner sits inside the box while Claude works', async () => {
  stubChat({ working: true })
  renderWithQuery(<ChatView session="claude" tabId="claude" />)
  const box = await screen.findByRole('textbox', { name: 'Message to Claude' })
  expect(box.parentElement).toContainElement(await screen.findByLabelText('Working...'))
  expect(screen.queryByRole('button', { name: 'Clear text' })).not.toBeInTheDocument()
  fireEvent.change(box, { target: { value: 'draft' } })
  fireEvent.click(screen.getByRole('button', { name: 'Clear text' }))
  expect(box).toHaveValue('')
})

it('a jump-to-latest button shows once the reader scrolls up and takes them to the bottom', async () => {
  stubChat({ messages: [tool(1)] })
  renderWithQuery(<ChatView session="MDP-1" tabId="MDP-1" />)
  await screen.findByText(/f1\.ts/)
  expect(screen.queryByRole('button', { name: 'Go to the latest message' })).toBeNull()
  const list = screen.getByTestId('chat-list')
  Object.defineProperty(list, 'scrollHeight', { value: 1000, configurable: true })
  Object.defineProperty(list, 'clientHeight', { value: 300, configurable: true })
  list.scrollTop = 100
  fireEvent.scroll(list)
  fireEvent.click(await screen.findByRole('button', { name: 'Go to the latest message' }))
  expect(list.scrollTop).toBe(1000)
})

it('a file path in a reply opens the file in the Files view; a web link stays a web link', async () => {
  const groups = [
    { id: 'wt0', label: 'BE - Backend', root: 'C:/wt/claude', paths: ['src/app.ts'], error: null },
  ]
  stubFetch((url) =>
    url === '/api/workspace/tabs/claude/files'
      ? jsonResponse(groups)
      : jsonResponse(
          chatData({
            messages: [
              {
                ...tool(1),
                role: 'assistant',
                text: 'Fixed in `src/app.ts:12`, see [the docs](https://example.com/doc.md).',
                toolName: null,
                toolDetail: null,
              },
            ],
          }),
        ),
  )
  const opened: unknown[] = []
  const listener = (event: Event): void => {
    opened.push((event as CustomEvent).detail)
  }
  window.addEventListener(OPEN_FILE_EVENT, listener)
  renderWithQuery(<ChatView session="claude" tabId="claude" />)
  fireEvent.click(await screen.findByRole('button', { name: 'src/app.ts:12' }))
  expect(opened).toEqual([
    expect.objectContaining({ tabId: 'claude', group: 'wt0', path: 'src/app.ts', line: 12 }),
  ])
  expect(screen.getByRole('link', { name: 'the docs' })).toHaveAttribute(
    'href',
    'https://example.com/doc.md',
  )
  window.removeEventListener(OPEN_FILE_EVENT, listener)
})
