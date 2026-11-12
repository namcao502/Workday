import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RemoteConfig } from '@workday/core'
import { describe, expect, it } from 'vitest'
import { EventHub } from '../events.js'
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
