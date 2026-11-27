import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ShellConfirmHost } from './ShellConfirmHost.js'

type MessageListener = (event: MessageEvent<unknown>) => void

function stubDesktopHost(): {
  readonly postMessage: ReturnType<typeof vi.fn>
  readonly emit: (data: unknown) => void
} {
  const listeners = new Set<MessageListener>()
  const postMessage = vi.fn()
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

const BUILD = {
  type: 'confirm',
  id: 'a1',
  title: 'Build and restart server',
  message: 'Running Claude sessions will be stopped.',
  confirmLabel: 'Build and restart',
  cancelLabel: 'Cancel',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

it('tells the shell it is ready, then shows its question and sends the answer', () => {
  const host = stubDesktopHost()
  render(<ShellConfirmHost />)
  expect(host.postMessage).toHaveBeenCalledWith({ type: 'confirm', action: 'ready' })
  host.emit(BUILD)
  const dialog = screen.getByRole('dialog', { name: 'Build and restart server' })
  expect(dialog).toHaveTextContent('Running Claude sessions will be stopped.')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Build and restart' }))
  expect(host.postMessage).toHaveBeenLastCalledWith({
    type: 'confirm',
    action: 'answer',
    id: 'a1',
    answer: true,
  })
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('Cancel and Escape answer no, and a second question waits for the first', () => {
  const host = stubDesktopHost()
  render(<ShellConfirmHost />)
  host.emit(BUILD)
  host.emit({ ...BUILD, id: 'a2', title: 'Update desktop app' })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(host.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: 'a1', answer: false }),
  )
  const next = screen.getByRole('dialog', { name: 'Update desktop app' })
  fireEvent.keyDown(next, { key: 'Escape' })
  expect(host.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: 'a2', answer: false }),
  )
})

it('a notice has one button and answers no; a malformed message shows nothing', () => {
  const host = stubDesktopHost()
  render(<ShellConfirmHost />)
  host.emit({ type: 'confirm', id: 'x' })
  host.emit({ ...BUILD, type: 'windowState' })
  expect(screen.queryByRole('dialog')).toBeNull()
  host.emit({ ...BUILD, id: 'n1', title: 'No script', confirmLabel: 'OK', cancelLabel: null })
  expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'OK' }))
  expect(host.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: 'n1', answer: false }),
  )
})

it('renders nothing in the browser', () => {
  const { container } = render(<ShellConfirmHost />)
  expect(container).toBeEmptyDOMElement()
})
