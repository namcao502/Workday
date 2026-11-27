import { isRecord } from '../json.js'

export type WindowAction = 'minimize' | 'toggleMaximize' | 'close'

interface WebViewHost {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void
}

declare global {
  interface Window {
    // Injected by the desktop shell before any page script runs.
    __workdayDesktop?: boolean
    chrome?: { webview?: WebViewHost }
  }
}

export function isDesktopShell(): boolean {
  return window.__workdayDesktop === true
}

export function sendWindowAction(action: WindowAction): void {
  window.chrome?.webview?.postMessage({ type: 'window', action })
}

// Calls back with the shell's maximize state on load and whenever it changes; returns the unsubscribe.
export function onWindowState(listener: (isMaximized: boolean) => void): () => void {
  const host = window.chrome?.webview
  if (host === undefined) {
    return () => undefined
  }
  const handle = (event: MessageEvent<unknown>): void => {
    const data = event.data
    if (
      typeof data === 'object' &&
      data !== null &&
      'type' in data &&
      data.type === 'windowState' &&
      'maximized' in data &&
      typeof data.maximized === 'boolean'
    ) {
      listener(data.maximized)
    }
  }
  host.addEventListener('message', handle)
  // The shell's own post on load can land before this listener exists, so ask once listening.
  host.postMessage({ type: 'window', action: 'queryState' })
  return () => {
    host.removeEventListener('message', handle)
  }
}

// Asks the shell to restart the Node server without a build, then reload the page.
export function requestServerRestart(): void {
  window.chrome?.webview?.postMessage({ type: 'server', action: 'restart' })
}

// Lets the shell (the foreground window) grant foreground rights, so a reused VS Code window the server
// opens can raise itself past Windows' focus-stealing block. A no-op in the browser.
export function allowEditorForeground(): void {
  window.chrome?.webview?.postMessage({ type: 'editor', action: 'allowForeground' })
}

// Sent as ?client= on the event socket and X-Workday-Client on every request.
export function clientKind(): 'app' | 'web' {
  return isDesktopShell() ? 'app' : 'web'
}

// A question the shell asks in the page instead of a Windows message box; the shell owns the text.
export interface ShellConfirm {
  readonly id: string
  readonly title: string
  readonly message: string
  readonly confirmLabel: string
  readonly cancelLabel: string | null // null: a notice with one button
}

function readShellConfirm(data: unknown): ShellConfirm | null {
  if (!isRecord(data)) {
    return null
  }
  const { id, title, message, confirmLabel, cancelLabel } = data
  const isValid =
    data['type'] === 'confirm' &&
    typeof id === 'string' &&
    typeof title === 'string' &&
    typeof message === 'string' &&
    typeof confirmLabel === 'string' &&
    (cancelLabel === null || typeof cancelLabel === 'string')
  return isValid ? { id, title, message, confirmLabel, cancelLabel } : null
}

// Calls back with each question the shell asks; returns the unsubscribe. A no-op in the browser.
export function onShellConfirm(listener: (confirm: ShellConfirm) => void): () => void {
  const host = window.chrome?.webview
  if (host === undefined) {
    return () => undefined
  }
  const handle = (event: MessageEvent<unknown>): void => {
    const confirm = readShellConfirm(event.data)
    if (confirm !== null) {
      listener(confirm)
    }
  }
  host.addEventListener('message', handle)
  // Tells the shell this page can show its questions; a page that never says so gets a message box.
  host.postMessage({ type: 'confirm', action: 'ready' })
  return () => {
    host.removeEventListener('message', handle)
  }
}

export function answerShellConfirm(id: string, answer: boolean): void {
  window.chrome?.webview?.postMessage({ type: 'confirm', action: 'answer', id, answer })
}
