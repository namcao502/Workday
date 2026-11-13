import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PushSubscriptionJson } from '@workday/core'
import { describe, expect, it } from 'vitest'
import { LOCAL_PUSH_LIMIT, LocalPushStore } from './localPushStore.js'

function subscription(endpoint: string, auth = 'a'): PushSubscriptionJson {
  return { endpoint, keys: { p256dh: 'p', auth } }
}

function newStore(): { store: LocalPushStore; path: string } {
  const path = join(mkdtempSync(join(tmpdir(), 'workday-localpush-')), 'local-push.json')
  return { store: new LocalPushStore(path), path }
}

describe('LocalPushStore', () => {
  it('the store keeps at most 5 and dedupes by endpoint', async () => {
    const { store } = newStore()

    for (let index = 0; index < LOCAL_PUSH_LIMIT + 2; index += 1) {
      await store.add(subscription(`https://push.example/${String(index)}`))
    }
    await store.add(subscription('https://push.example/4', 'newer'))

    const endpoints = store.list().map((item) => item.endpoint)
    expect(endpoints).toEqual([
      'https://push.example/2',
      'https://push.example/3',
      'https://push.example/5',
      'https://push.example/6',
      'https://push.example/4',
    ])
    expect(store.list().at(-1)?.keys.auth).toBe('newer')
  })

  it('persists across a restart and remove deletes by endpoint', async () => {
    const { store, path } = newStore()
    await store.add(subscription('https://push.example/a'))
    await store.add(subscription('https://push.example/b'))
    await store.remove('https://push.example/a')

    expect(new LocalPushStore(path).list().map((item) => item.endpoint)).toEqual([
      'https://push.example/b',
    ])
  })

  it('drops entries that are not https subscriptions with keys', () => {
    const { path } = newStore()
    writeFileSync(
      path,
      JSON.stringify([
        subscription('https://push.example/ok'),
        subscription('http://push.example/plain'),
        { endpoint: 'https://push.example/nokeys' },
        'junk',
      ]),
    )

    expect(new LocalPushStore(path).list().map((item) => item.endpoint)).toEqual([
      'https://push.example/ok',
    ])
  })
})
