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
