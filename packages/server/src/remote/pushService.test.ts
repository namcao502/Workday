import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AccessLevel, PushSubscriptionJson } from '@workday/core'
import { describe, expect, it } from 'vitest'
import { DeviceStore } from './deviceStore.js'
import { PushService, type PushMessage, type SendPush, type VapidDetails } from './pushService.js'

const NOW = new Date('2026-11-10T08:00:00Z')
const HOST = 'workday.example.com'
const MESSAGE: PushMessage = {
  title: 'Workday',
  body: 'Hello',
  url: '/#/timesheet',
  tag: 'log-reminder-2026-11-10',
}

interface Sent {
  readonly endpoint: string
  readonly payload: string
  readonly vapid: VapidDetails
}

function subscription(endpoint: string): PushSubscriptionJson {
  return { endpoint, keys: { p256dh: 'p', auth: 'a' } }
}

function setup(statusCode = 201, host: string | null = HOST) {
  const dataDir = mkdtempSync(join(tmpdir(), 'workday-push-'))
  const store = new DeviceStore(join(dataDir, 'devices.json'))
  const sent: Sent[] = []
  const send: SendPush = (target, payload, vapid) => {
    sent.push({ endpoint: target.endpoint, payload, vapid })
    return Promise.resolve({ statusCode })
  }
  const create = (): PushService =>
    new PushService({ dataDir, store, publicHost: () => host, send, logError: () => undefined })
  return { dataDir, store, sent, push: create(), create }
}

async function addDevice(
  store: DeviceStore,
  endpoint: string,
  timesheet: AccessLevel,
  hasPush: boolean,
): Promise<string> {
  const { device } = await store.add(endpoint, NOW, null)
  await store.update(device.id, (current) => ({
    ...current,
    rights: { ...current.rights, timesheet },
    pushEnabled: hasPush,
    pushSubscription: hasPush ? subscription(endpoint) : null,
  }))
  return device.id
}

describe('PushService', () => {
  it('sendToArea skips devices without push or without view access to the area', async () => {
    const { store, sent, push } = setup()
    await addDevice(store, 'https://push/ok', 'view', true)
    await addDevice(store, 'https://push/no-access', 'off', true)
    await addDevice(store, 'https://push/no-push', 'view', false)

    await push.sendToArea('timesheet', MESSAGE)

    expect(sent.map((item) => item.endpoint)).toEqual(['https://push/ok'])
    expect(JSON.parse(sent[0]?.payload ?? '')).toEqual(MESSAGE)
    expect(sent[0]?.vapid.subject).toBe(`https://${HOST}`)
  })

  it.each([404, 410])('sendToArea clears the subscription on %i', async (statusCode) => {
    const { store, push } = setup(statusCode)
    const id = await addDevice(store, 'https://push/gone', 'view', true)

    await push.sendToArea('timesheet', MESSAGE)

    const device = store.list().find((item) => item.id === id)
    expect(device?.pushSubscription).toBeNull()
    expect(device?.hasPushSubscription).toBe(false)
  })

  it('sendToArea keeps the subscription on another error and never rejects', async () => {
    const { store, push } = setup(500)
    const id = await addDevice(store, 'https://push/busy', 'view', true)

    await push.sendToArea('timesheet', MESSAGE)

    expect(store.list().find((item) => item.id === id)?.pushSubscription).not.toBeNull()
  })

  it('sendToArea never rejects when the sender throws', async () => {
    const { dataDir, store } = setup()
    await addDevice(store, 'https://push/boom', 'view', true)
    const logged: string[] = []
    const push = new PushService({
      dataDir,
      store,
      publicHost: () => HOST,
      send: () => Promise.reject(new Error('network down')),
      logError: (message) => logged.push(message),
    })

    await expect(push.sendToArea('timesheet', MESSAGE)).resolves.toBeUndefined()
    expect(logged).toHaveLength(1)
  })

  it('sends nothing while there is no public host', async () => {
    const { store, sent, push } = setup(201, null)
    const id = await addDevice(store, 'https://push/ok', 'view', true)

    await push.sendToArea('timesheet', MESSAGE)

    expect(sent).toEqual([])
    expect(await push.sendToDevice(id, MESSAGE)).toEqual({ ok: false })
  })

  it('sendToDevice reaches only that device, and only when it has push turned on', async () => {
    const { store, sent, push } = setup()
    const id = await addDevice(store, 'https://push/me', 'off', true)
    await addDevice(store, 'https://push/other', 'view', true)
    const off = await addDevice(store, 'https://push/off', 'view', false)

    expect(await push.sendToDevice(id, MESSAGE)).toEqual({ ok: true })
    expect(await push.sendToDevice(off, MESSAGE)).toEqual({ ok: false })
    expect(await push.sendToDevice('missing', MESSAGE)).toEqual({ ok: false })
    expect(sent.map((item) => item.endpoint)).toEqual(['https://push/me'])
  })

  it('creates the VAPID keys once, keeps the private one sealed and reloads them', async () => {
    const { dataDir, create, push } = setup()
    expect(push.peekPublicKey()).toBeNull()

    const first = await push.publicKey()
    const second = await create().publicKey()

    expect(first).not.toBe('')
    expect(second).toBe(first)
    expect(create().peekPublicKey()).toBe(first)
    const secrets = readFileSync(join(dataDir, 'secrets.json'), 'utf8')
    expect(secrets).toContain('"vapidPrivateKey": "enc:v1:')
    expect(JSON.parse(readFileSync(join(dataDir, 'remote.json'), 'utf8'))).toEqual({
      vapidPublicKey: first,
    })
  })
})
