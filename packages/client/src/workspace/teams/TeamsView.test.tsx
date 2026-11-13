import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import type { TeamsMessage, TeamsReadView } from '@workday/core'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { jsonResponse, renderWithQuery, stubFetch, type FetchMock } from '../../testSupport.js'
import { TeamsMessageRow } from './TeamsMessageRow.js'
import { TeamsView } from './TeamsView.js'

const AMS = 'https://eu-api.asm.skype.com/v1/objects/0-abc/views/imgo'

function message(overrides: Partial<TeamsMessage> = {}): TeamsMessage {
  return {
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
    ...overrides,
  }
}

function thread(messages: readonly TeamsMessage[], pending: readonly string[] = []): TeamsReadView {
  return {
    state: 'thread',
    options: [{ id: 'c1', label: 'Team > Chan', kind: 'channel', posted: true }],
    conversationId: 'c1',
    thread: { conversationId: 'c1', rootId: 'm1', messages, isChat: false },
    myId: '8:orgid:me',
    people: [],
    deepLink: 'https://teams.example/l/1',
    pending,
  }
}

function posts(fetchMock: FetchMock): string[] {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([url]) => url)
}

function renderView(): void {
  renderWithQuery(<TeamsView ticket="MDP-1" conversation="" firstSession="MDP-1" visible />)
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn() // jsdom has none
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('teams view shows the sign-in panel when signed out', async () => {
  const fetchMock = stubFetch((url) =>
    url.startsWith('/api/teams/signin')
      ? jsonResponse({ ok: true })
      : jsonResponse({ state: 'signedOut', pending: [] }),
  )
  renderView()
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in to Teams' }))
  await waitFor(() => {
    expect(posts(fetchMock)).toContain('/api/teams/signin')
  })
})

it('teams view polls again while searching', async () => {
  const fetchMock = stubFetch(() => jsonResponse({ state: 'searching', options: [], pending: [] }))
  vi.useFakeTimers({ shouldAdvanceTime: true })
  renderView()
  expect(await screen.findByText('Looking for an older post...')).toBeInTheDocument()
  const before = fetchMock.mock.calls.length
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5100)
  })
  expect(fetchMock.mock.calls.length).toBeGreaterThan(before)
})

it('message row sanitizes html and routes AMS images through the proxy', () => {
  const content = `<p>hi<script>alert(1)</script></p><img itemtype="http://schema.skype.com/AMSImage" src="${AMS}">`
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  const { container } = renderWithQuery(
    <TeamsMessageRow
      message={message({ content, isPlainText: false })}
      myId="x"
      timeZone="UTC"
      locked={false}
      onReact={() => undefined}
      onAskClaude={() => undefined}
      onEdit={() => undefined}
      onDelete={() => undefined}
    />,
  )
  expect(container.querySelector('script')).toBeNull()
  const image = container.querySelector('.teams-content img')
  expect(image?.getAttribute('src')).toBe(`/api/teams/image?url=${encodeURIComponent(AMS)}`)
  fireEvent.click(image as Element)
  expect(open).toHaveBeenCalledWith(
    expect.stringContaining('/api/teams/image?url='),
    '_blank',
    'noopener',
  )
})

it('own message shows edit and delete; delete asks first', async () => {
  const fetchMock = stubFetch((url) =>
    url.startsWith('/api/teams/MDP-1/delete')
      ? jsonResponse({ ok: true, id: null })
      : jsonResponse(thread([message()])),
  )
  renderView()
  expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  expect(posts(fetchMock)).toHaveLength(0)
  const dialogDelete = screen.getAllByRole('button', { name: 'Delete' }).at(-1) as HTMLElement
  fireEvent.click(dialogDelete)
  await waitFor(() => {
    expect(posts(fetchMock)).toContain('/api/teams/MDP-1/delete')
  })
})

it('a reaction press locks the reactions until the request ends', async () => {
  let release: (response: Response) => void = () => undefined
  const pendingReply = new Promise<Response>((resolve) => {
    release = resolve
  })
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.startsWith('/api/teams/MDP-1/react')
        ? pendingReply
        : Promise.resolve(jsonResponse(thread([message({ senderId: 'other' })]))),
    ),
  )
  renderView()
  const like = await screen.findByRole('button', { name: 'React like' })
  fireEvent.click(like)
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'React heart' })).toBeDisabled()
  })
  release(jsonResponse({ ok: true, id: null }))
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'React heart' })).toBeEnabled()
  })
})

it('opening a pending conversation marks it seen', async () => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  const fetchMock = stubFetch((url) =>
    url.startsWith('/api/teams/MDP-1/seen')
      ? jsonResponse({ ok: true })
      : jsonResponse(thread([message()], ['c1'])),
  )
  renderView()
  await waitFor(() => {
    expect(posts(fetchMock)).toContain('/api/teams/MDP-1/seen')
  })
})
