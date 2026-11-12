import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DeviceStore, NAME_MAX_LENGTH } from './deviceStore.js'

const NOW = new Date('2026-11-10T08:00:00.000Z')

function devicesPath(): string {
  return join(mkdtempSync(join(tmpdir(), 'workday-devices-')), 'devices.json')
}

function storedDevicesJson(rights: Record<string, string>): string {
  return JSON.stringify([
    {
      id: 'a',
      name: 'old',
      email: null,
      tokenHash: 'h',
      rights,
      pushEnabled: false,
      pushSubscription: null,
      createdAt: '2026-11-01T00:00:00.000Z',
      lastSeenAt: null,
    },
  ])
}

describe('DeviceStore', () => {
  it('add stores only the hash and findByToken finds the device', async () => {
    const path = devicesPath()
    const store = new DeviceStore(path)

    const added = await store.add('iPhone', NOW, 'me@example.com')

    expect(added.device.tokenHash).not.toBe(added.token)
    expect(store.findByToken(added.token)?.id).toBe(added.device.id)
    expect(store.findByToken('wrong')).toBeNull()
    expect(readFileSync(path, 'utf8')).not.toContain(added.token)
    const reloaded = new DeviceStore(path).list()[0]
    expect(reloaded?.rights.timesheet).toBe('act')
    expect(reloaded?.email).toBe('me@example.com')
  })

  it('findByToken returns null for a revoked device', async () => {
    const store = new DeviceStore(devicesPath())
    const added = await store.add('iPhone', NOW, null)

    await store.remove(added.device.id)

    expect(store.findByToken(added.token)).toBeNull()
  })

  it('update changes the device', async () => {
    const store = new DeviceStore(devicesPath())
    const added = await store.add('iPhone', NOW, null)

    await store.update(added.device.id, (device) => ({ ...device, name: 'Renamed' }))

    expect(store.list()[0]?.name).toBe('Renamed')
  })

  it('rename changes only the name', async () => {
    const store = new DeviceStore(devicesPath())
    const added = await store.add('iPhone', NOW, null)
    await store.update(added.device.id, (device) => ({ ...device, pushEnabled: true }))
    const before = store.list()[0]

    await store.rename(added.device.id, '  Kitchen iPad ')

    expect(store.list()[0]).toEqual({ ...before, name: 'Kitchen iPad' })
  })

  it('rename trims and rejects empty', async () => {
    const store = new DeviceStore(devicesPath())
    const added = await store.add('iPhone', NOW, null)

    await store.rename(added.device.id, '   ')
    expect(store.list()[0]?.name).toBe('iPhone')

    await store.rename(added.device.id, 'a'.repeat(60))
    expect(store.list()[0]?.name).toHaveLength(NAME_MAX_LENGTH)
  })

  it('load keeps a corrupt file as bad and returns empty', () => {
    const path = devicesPath()
    writeFileSync(path, '{ not json')

    expect(new DeviceStore(path).list()).toEqual([])
    expect(existsSync(`${path}.bad`)).toBe(true)
  })

  it('load ignores unknown areas', () => {
    const path = devicesPath()
    writeFileSync(path, storedDevicesJson({ hologram: 'act', board: 'view' }))

    const devices = new DeviceStore(path).list()

    expect(devices).toHaveLength(1)
    expect(devices[0]?.rights).toEqual({ board: 'view', timesheet: 'off' })
    expect(existsSync(`${path}.bad`)).toBe(false)
  })

  it('lastSeenAt is written at most once a minute', async () => {
    const path = devicesPath()
    const store = new DeviceStore(path)
    const added = await store.add('iPhone', NOW, null)

    await store.touch(added.device.id, new Date(NOW.getTime() + 1_000))
    const firstSeen = store.list()[0]?.lastSeenAt
    await store.touch(added.device.id, new Date(NOW.getTime() + 30_000))
    const fileAfterSecondTouch = readFileSync(path, 'utf8')
    await store.touch(added.device.id, new Date(NOW.getTime() + 62_000))

    expect(firstSeen).toBe('2026-11-10T08:00:01.000Z')
    expect(fileAfterSecondTouch).toContain('2026-11-10T08:00:01.000Z')
    expect(store.list()[0]?.lastSeenAt).toBe('2026-11-10T08:01:02.000Z')
    expect(new DeviceStore(path).list()[0]?.lastSeenAt).toBe('2026-11-10T08:01:02.000Z')
  })
})
