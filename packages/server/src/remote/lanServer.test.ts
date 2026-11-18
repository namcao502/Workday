import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VpnConfig } from '@workday/core'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanServer } from './lanServer.js'
import type { VpnSurface } from './remoteGate.js'
import type { SetupServerOptions } from './setupServer.js'

const VPN: VpnConfig = {
  enabled: true,
  address: '127.0.0.1',
  httpsPort: 8443,
  setupPort: 8444,
  allowedRanges: ['10.20.0.0/16'],
}
const DAY_MS = 86_400_000

interface FakeApp {
  readonly surface: VpnSurface
  readonly calls: string[]
  readonly secureContexts: { key: string; cert: string }[]
}

function setup(listenError: Error | null = null) {
  const apps: FakeApp[] = []
  const setupCalls: string[] = []
  const setupOptions: SetupServerOptions[] = []
  const changes = { count: 0 }
  const clock = { now: new Date('2026-01-01T00:00:00Z') }
  const lan = new LanServer({
    dataDir: mkdtempSync(join(tmpdir(), 'workday-lan-')),
    now: () => clock.now,
    language: () => 'en',
    onChange: () => {
      changes.count += 1
    },
    logError: () => undefined,
    setup: {
      open: (options) => {
        setupCalls.push('open')
        setupOptions.push(options)
        return Promise.resolve()
      },
      close: () => {
        setupCalls.push('close')
        return Promise.resolve()
      },
    },
    createApp: (surface) => {
      const app: FakeApp = { surface, calls: [], secureContexts: [] }
      apps.push(app)
      const fake = {
        listen: (options: { host: string; port: number }) => {
          app.calls.push(`listen ${options.host}:${String(options.port)}`)
          return listenError === null ? Promise.resolve('') : Promise.reject(listenError)
        },
        close: () => {
          app.calls.push('close')
          return Promise.resolve()
        },
        server: {
          setSecureContext: (context: { key: string; cert: string }) => {
            app.secureContexts.push(context)
          },
        },
      }
      return Promise.resolve(fake as unknown as FastifyInstance)
    },
  })
  return { lan, apps, setupCalls, setupOptions, changes, clock }
}

describe('LanServer', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts on the address and reports running', async () => {
    const { lan, apps, changes } = setup()

    await lan.apply(VPN)

    expect(apps).toHaveLength(1)
    expect(apps[0]?.calls).toEqual(['listen 127.0.0.1:8443'])
    expect(apps[0]?.surface.host).toBe('127.0.0.1:8443')
    expect(apps[0]?.surface.origin).toBe('https://127.0.0.1:8443')
    expect(lan.status().server).toBe('running')
    expect(lan.status().httpsUrl).toBe('https://127.0.0.1:8443')
    expect(lan.status().setupUrl).toBe('http://127.0.0.1:8444/setup')
    expect(changes.count).toBeGreaterThanOrEqual(2)
    await lan.stop()
  })

  it('a listen error reports failed with the message', async () => {
    const { lan, apps } = setup(new Error('listen EADDRNOTAVAIL'))

    await lan.apply(VPN)

    expect(lan.status().server).toBe('failed')
    expect(lan.status().serverDetail).toBe('listen EADDRNOTAVAIL')
    expect(apps[0]?.calls).toContain('close')
  })

  it('a new address restarts the listener', async () => {
    const { lan, apps } = setup()
    await lan.apply(VPN)

    await lan.apply({ ...VPN, address: '127.0.0.2' })

    expect(apps).toHaveLength(2)
    expect(apps[0]?.calls).toEqual(['listen 127.0.0.1:8443', 'close'])
    expect(apps[1]?.calls).toEqual(['listen 127.0.0.2:8443'])
    await lan.stop()
  })

  it('a ranges-only change keeps the listener', async () => {
    const { lan, apps } = setup()
    await lan.apply(VPN)

    await lan.apply({ ...VPN, allowedRanges: ['10.30.0.0/16'] })

    expect(apps).toHaveLength(1)
    expect(apps[0]?.calls).toEqual(['listen 127.0.0.1:8443'])
    expect(lan.status().server).toBe('running')
    await lan.stop()
  })

  it('turning off closes the listener and the setup server', async () => {
    const { lan, apps, setupCalls } = setup()
    await lan.apply(VPN)
    await lan.setSetupOpen(true)

    await lan.apply({ ...VPN, enabled: false })

    expect(apps[0]?.calls).toEqual(['listen 127.0.0.1:8443', 'close'])
    expect(setupCalls.at(-1)).toBe('close')
    expect(setupCalls).toContain('open')
    expect(lan.status().server).toBe('off')
  })

  it('opens the setup server only while running, with the current ranges', async () => {
    const { lan, setupCalls, setupOptions } = setup()

    await lan.setSetupOpen(true)
    await lan.apply(VPN)
    await lan.setSetupOpen(true)

    expect(setupCalls[0]).toBe('close')
    expect(setupCalls.at(-1)).toBe('open')
    expect(setupOptions[0]?.port).toBe(8444)
    expect(setupOptions[0]?.httpsUrl).toBe('https://127.0.0.1:8443')
    expect(setupOptions[0]?.allowedRanges).toEqual(['10.20.0.0/16'])
    await lan.stop()
  })

  it('a renewed cert is swapped in without a restart', async () => {
    const { lan, apps, clock } = setup()
    await lan.apply(VPN)
    clock.now = new Date(clock.now.getTime() + 400 * DAY_MS)

    await vi.advanceTimersByTimeAsync(DAY_MS)

    // The renewal does real file and crypto work, which fake timers do not cover.
    await vi.waitFor(() => {
      expect(apps[0]?.secureContexts).toHaveLength(1)
    })
    expect(apps).toHaveLength(1)
    await lan.stop()
  })
})
