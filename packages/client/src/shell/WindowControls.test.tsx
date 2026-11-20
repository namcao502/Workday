import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WindowControls } from './WindowControls.js'

type MessageListener = (event: MessageEvent<unknown>) => void

interface StubHost {
  readonly postMessage: ReturnType<typeof vi.fn>
  readonly emit: (data: unknown) => void
}

function stubDesktopHost(): StubHost {
  const listeners = new Set<MessageListener>()
  const postMessage = vi.fn()
  vi.stubGlobal('__workdayDesktop', true)
  vi.stubGlobal('chrome', {
    webview: {
      postMessage,
      addEventListener: (_type: 'message', listener: MessageListener) => listeners.add(listener),
      removeEventListener: (_type: 'message', listener: MessageListener) =>
        listeners.delete(listener),
    },
  })
  const emit = (data: unknown): void => {
    act(() => {
      for (const listener of listeners) {
        listener(new MessageEvent('message', { data }))
      }
    })
  }
  return { postMessage, emit }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

it('renders nothing outside the desktop shell', () => {
  const { container } = render(<WindowControls />)
  expect(container).toBeEmptyDOMElement()
})

it('posts minimize, toggleMaximize and close to the shell', () => {
  const host = stubDesktopHost()
  render(<WindowControls />)
  fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
  fireEvent.click(screen.getByRole('button', { name: 'Maximize' }))
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(host.postMessage.mock.calls).toEqual([
    [{ type: 'window', action: 'minimize' }],
    [{ type: 'window', action: 'toggleMaximize' }],
    [{ type: 'window', action: 'close' }],
  ])
})

it('shows the restore glyph once the shell reports maximized', () => {
  const host = stubDesktopHost()
  render(<WindowControls />)
  expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument()
  host.emit({ type: 'windowState', maximized: true })
  expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Maximize' })).not.toBeInTheDocument()
  host.emit({ type: 'windowState', maximized: false })
  expect(screen.getByRole('button', { name: 'Maximize' })).toBeInTheDocument()
})
