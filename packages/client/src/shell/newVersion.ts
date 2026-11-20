import { useEffect, useState } from 'react'

export const CHECK_VERSION_EVENT = 'workday:check-version'
const CHECK_MS = 5 * 60_000
const ENTRY_SCRIPT = /<script[^>]*type="module"[^>]*src="([^"]+)"/

// The hashed entry script of a built index.html ("/assets/index-AB12.js"); a new build changes it.
export function entryScript(html: string): string | null {
  return ENTRY_SCRIPT.exec(html)?.[1] ?? null
}

function runningScript(): string | null {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]')
  if (script === null) {
    return null
  }
  return new URL(script.src, window.location.origin).pathname
}

// True once the server serves a build other than the one running: on F5, on focus and every 5 minutes.
export function useNewVersion(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const running = runningScript()
    // The Vite dev server serves /src/main.tsx, never a hashed build; nothing to compare there.
    if (running?.startsWith('/assets/') !== true) {
      return
    }
    let stopped = false
    async function check(): Promise<void> {
      try {
        const response = await fetch('/', { cache: 'no-store' })
        const served = response.ok ? entryScript(await response.text()) : null
        if (!stopped && served !== null && served !== running) {
          setReady(true)
        }
      } catch {
        // The server is down for a moment (a restart); the next check asks again.
      }
    }
    function onCheck(): void {
      void check()
    }
    const timer = window.setInterval(onCheck, CHECK_MS)
    window.addEventListener(CHECK_VERSION_EVENT, onCheck)
    window.addEventListener('focus', onCheck)
    return () => {
      stopped = true
      window.clearInterval(timer)
      window.removeEventListener(CHECK_VERSION_EVENT, onCheck)
      window.removeEventListener('focus', onCheck)
    }
  }, [])
  return ready
}
