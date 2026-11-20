import { describe, expect, it } from 'vitest'
import { EventHub, type EventSocket } from './events.js'

class FakeSocket implements EventSocket {
  readyState = 1
  readonly sent: string[] = []
  closed = false

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.closed = true
    this.readyState = 3
  }
}

const TAKEN_BY_APP = JSON.stringify({ type: 'session.takenByApp' })
const TAKEN_BY_TAB = JSON.stringify({ type: 'session.takenByTab' })

describe('EventHub one screen on this PC', () => {
  it('an app closes local web sockets with takenByApp', () => {
    const hub = new EventHub()
    const web = new FakeSocket()
    hub.add(web, null, 'loopback', 'web')
    const app = new FakeSocket()
    hub.add(app, null, 'loopback', 'app')
    expect(web.sent).toEqual([TAKEN_BY_APP])
    expect(web.closed).toBe(true)
    expect(app.closed).toBe(false)
    expect(hub.hasLocalApp()).toBe(true)
  })

  it('a web socket is refused while an app is connected', () => {
    const hub = new EventHub()
    hub.add(new FakeSocket(), null, 'loopback', 'app')
    const web = new FakeSocket()
    hub.add(web, null, 'loopback', 'web')
    expect(web.sent).toEqual([TAKEN_BY_APP])
    expect(web.closed).toBe(true)
  })

  it('a newer web tab replaces the older one', () => {
    const hub = new EventHub()
    const older = new FakeSocket()
    hub.add(older, null, 'loopback', 'web')
    const newer = new FakeSocket()
    hub.add(newer, null, 'loopback', 'web')
    expect(older.sent).toEqual([TAKEN_BY_TAB])
    expect(older.closed).toBe(true)
    expect(newer.closed).toBe(false)
    expect(hub.hasLocalApp()).toBe(false)
  })

  it('the app going away lets a web tab in again', () => {
    const hub = new EventHub()
    const remove = hub.add(new FakeSocket(), null, 'loopback', 'app')
    remove()
    const web = new FakeSocket()
    hub.add(web, null, 'loopback', 'web')
    expect(web.closed).toBe(false)
  })

  it('remote sockets are never closed by local clients', () => {
    const hub = new EventHub()
    const phone = new FakeSocket()
    hub.add(phone, 'device-1', 'loopback', 'web')
    const phoneApp = new FakeSocket()
    hub.add(phoneApp, 'device-2', 'vpn', 'app')
    hub.add(new FakeSocket(), null, 'loopback', 'app')
    expect(phone.closed).toBe(false)
    expect(phoneApp.closed).toBe(false)
    expect(hub.hasLocalApp()).toBe(true)
    const lateWeb = new FakeSocket()
    hub.add(lateWeb, 'device-3', 'vpn', 'web')
    expect(lateWeb.closed).toBe(false)
  })
})
