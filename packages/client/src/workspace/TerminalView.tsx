import { FitAddon } from '@xterm/addon-fit'
import { Terminal, type ITheme } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef } from 'react'
import { errorText } from '../errors.js'
import { t } from '../i18n.js'
import { openTerminalSocket } from './terminalSocket.js'

const RESIZE_DEBOUNCE_MS = 100
const GRAY = '\x1b[90m'
const RED = '\x1b[31m'
const RESET = '\x1b[0m'

// xterm does not parse the space-separated "rgb(28 28 30)" the theme tokens use, so convert to hex.
function tokenColor(name: string): string {
  const parts = getComputedStyle(document.documentElement).getPropertyValue(name).match(/\d+/g)
  if (parts === null || parts.length < 3) {
    return '#000000'
  }
  return `#${parts
    .slice(0, 3)
    .map((part) => Number(part).toString(16).padStart(2, '0'))
    .join('')}`
}

function currentTheme(): ITheme {
  return {
    background: tokenColor('--window-bg'),
    foreground: tokenColor('--text-primary'),
    cursor: tokenColor('--text-primary'),
  }
}

interface TerminalViewProps {
  readonly session: string
  readonly visible: boolean
  // Hidden behind the chat: visibility keeps the size, so the PTY is not resized to nothing.
  readonly concealed?: boolean
}

// One xterm per mount. Unmounting closes the socket only; the session keeps running on the server.
export function TerminalView({
  session,
  visible,
  concealed = false,
}: TerminalViewProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (host === null) {
      return undefined
    }
    const terminal = new Terminal({
      fontFamily: 'Cascadia Mono, Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: currentTheme(),
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host)
    fit.fit()
    terminalRef.current = terminal

    let exited = false
    let sent = { columns: terminal.cols, rows: terminal.rows }
    const socket = openTerminalSocket(session, {
      onMessage: (message) => {
        if (message.type === 'output') {
          terminal.write(message.data)
        } else if (message.type === 'exited') {
          exited = true
          terminal.write(
            `\r\n${GRAY}${t('The terminal exited. Press Enter to start it again.', 'Terminal đã thoát. Nhấn Enter để chạy lại.')}${RESET}\r\n`,
          )
        } else {
          terminal.write(`\r\n${RED}${errorText({ code: message.code })}${RESET}\r\n`)
        }
      },
      onClose: () => undefined,
    })
    socket.send({ type: 'attach', ...sent })

    terminal.onData((data) => {
      if (exited && data === '\r') {
        exited = false
        socket.send({ type: 'start', columns: terminal.cols, rows: terminal.rows })
        return
      }
      socket.send({ type: 'input', data })
    })

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') {
        return true
      }
      if (event.key === 'Enter' && event.shiftKey) {
        socket.send({ type: 'input', data: '\n' })
        return false
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'c' && terminal.hasSelection()) {
        void navigator.clipboard.writeText(terminal.getSelection())
        terminal.clearSelection()
        return false
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        void navigator.clipboard.readText().then((text) => {
          terminal.paste(text)
        })
        return false
      }
      return true
    })

    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        fit.fit()
        if (terminal.cols !== sent.columns || terminal.rows !== sent.rows) {
          sent = { columns: terminal.cols, rows: terminal.rows }
          socket.send({ type: 'resize', ...sent })
        }
      }, RESIZE_DEBOUNCE_MS)
    })
    observer.observe(host)

    const themeObserver = new MutationObserver(() => {
      terminal.options.theme = currentTheme()
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    return () => {
      clearTimeout(resizeTimer)
      observer.disconnect()
      themeObserver.disconnect()
      socket.close()
      terminal.dispose()
      terminalRef.current = null
    }
  }, [session])

  useEffect(() => {
    if (visible && !concealed) {
      terminalRef.current?.focus()
    }
  }, [visible, concealed])

  return (
    <div
      ref={hostRef}
      className="terminal-host"
      hidden={!visible}
      style={concealed ? { visibility: 'hidden' } : undefined}
    />
  )
}
