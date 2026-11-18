import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RemoteConfig, VpnConfig, VpnStatusView } from '@workday/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventHub } from '../events.js'
import type { LanListener } from './lanServer.js'
import { RemoteService } from './remoteService.js'
import type { TunnelProcess } from './tunnelSupervisor.js'

const REMOTE: RemoteConfig = {
  enabled: true,
  publicHost: 'workday.example.com',
  accessTeamDomain: 'team.cloudflareaccess.com',
  accessAud: 'aud-123',
  cloudflaredPath: '/usr/bin/cloudflared',
}

function setup(token: string | null) {
  const spawned: { path: string; token: string | undefined }[] = []
  const killed = { count: 0 }
  const process: TunnelProcess = {
    onOutput: () => undefined,
    onExit: () => undefined,
    onError: () => undefined,
    kill: () => {
      killed.count += 1
    },
  }
  const service = new RemoteService({
    dataDir: mkdtempSync(join(tmpdir(), 'workday-remote-')),
    events: new EventHub(),
    now: () => new Date(),
    spawnTunnel: (path, _args, env) => {
      spawned.push({ path, token: env['TUNNEL_TOKEN'] })
      return process
    },
    loadTunnelToken: () => token,
    logError: () => undefined,
  })
  return { service, spawned, killed }
}

describe('RemoteService tunnel', () => {
  it('starts the tunnel once for an enabled config with a path and a token', () => {
    const { service, spawned } = setup('secret')

    service.configure(REMOTE)
    service.configure({ ...REMOTE })

    expect(spawned).toEqual([{ path: REMOTE.cloudflaredPath, token: 'secret' }])
    expect(service.status().tunnel).toBe('starting')
  })

  it('does not start without a token or a path', () => {
    const noToken = setup(null)
    const noPath = setup('secret')

    noToken.service.configure(REMOTE)
    noPath.service.configure({ ...REMOTE, cloudflaredPath: null })

    expect(noToken.spawned).toEqual([])
    expect(noPath.spawned).toEqual([])
    expect(noToken.service.status().tunnel).toBe('off')
  })

  it('stops the tunnel when remote is turned off', () => {
    const { service, killed } = setup('secret')
    service.configure(REMOTE)

    service.configure({ ...REMOTE, enabled: false })

    expect(killed.count).toBe(1)
    expect(service.status().tunnel).toBe('off')
  })
})

const VPN: VpnConfig = {
  enabled: true,
  address: '10.20.30.40',
  httpsPort: 8443,
  setupPort: 8444,
  allowedRanges: ['10.20.0.0/16'],
}

class FakeLan implements LanListener {
  readonly applied: (VpnConfig | null)[] = []
  readonly setupCalls: boolean[] = []
  apply(vpn: VpnConfig | null): Promise<void> {
    this.applied.push(vpn)
    return Promise.resolve()
  }
  setSetupOpen(open: boolean): Promise<void> {
    this.setupCalls.push(open)
    return Promise.resolve()
  }
  status(): VpnStatusView {
    return {
      server: 'running',
      serverDetail: null,
      addresses: [],
      httpsUrl: null,
      setupUrl: null,
      caFingerprint: null,
    }
  }
  stop(): Promise<void> {
    return Promise.resolve()
  }
}

describe('RemoteService vpn', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function build(clock: { now: Date } = { now: new Date() }) {
    const events = new EventHub()
    const sent: string[] = []
    const service = new RemoteService({
      dataDir: mkdtempSync(join(tmpdir(), 'workday-remote-')),
      events,
      now: () => clock.now,
      sendPush: (_subscription, _payload, vapid) => {
        sent.push(vapid.subject)
        return Promise.resolve({ statusCode: 201 })
      },
      loadTunnelToken: () => null,
      logError: () => undefined,
    })
    return { service, events, sent, lan: new FakeLan() }
  }

  it('turning vpn off closes only vpn sockets', () => {
    const { service, events, lan } = build()
    const closeAll = vi.spyOn(events, 'closeAllDevices')
    service.attachLan(lan)

    service.configureVpn({ ...VPN, enabled: false })

    expect(closeAll).toHaveBeenCalledWith('vpn')
    expect(closeAll).not.toHaveBeenCalledWith()
    expect(lan.applied).toEqual([null, { ...VPN, enabled: false }])
  })

  it('the setup server opens with pairing and closes once it expires', () => {
    vi.useFakeTimers()
    const clock = { now: new Date('2026-01-01T00:00:00Z') }
    const { service, lan } = build(clock)
    service.attachLan(lan)

    service.openPairing()
    expect(lan.setupCalls).toEqual([true])

    clock.now = new Date(clock.now.getTime() + 6 * 60_000)
    vi.advanceTimersByTime(10_000)
    expect(lan.setupCalls).toEqual([true, false])

    vi.advanceTimersByTime(30_000)
    expect(lan.setupCalls).toEqual([true, false])
  })

  it('push origin prefers Cloudflare, then the vpn', async () => {
    const { service, sent } = build()
    const device = { endpoint: 'https://push/1', keys: { p256dh: 'a', auth: 'b' } }
    const { code } = service.openPairing()
    const submitted = service.submitPairing(code ?? '', 'Phone', { email: null, ip: null })
    await service.approvePairing()
    const id = service.status().devices[0]?.id ?? ''
    await service.setPushSubscription(id, device)
    expect(submitted.ok).toBe(true)

    service.configureVpn(VPN)
    await service.push.sendToDevice(id, { title: 't', body: 'b', url: '/', tag: 'x' })
    service.configure(REMOTE)
    await service.push.sendToDevice(id, { title: 't', body: 'b', url: '/', tag: 'x' })

    expect(sent).toEqual(['https://10.20.30.40:8443', 'https://workday.example.com'])
  })
})
