import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DeviceStore } from './deviceStore.js'
import { Pairing, type PairingRequest } from './pairing.js'

const NOW = new Date('2026-11-10T08:00:00.000Z')
const PHONE = { email: 'me@example.com', ip: '172.16.1.2' }

function minutesLater(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60_000)
}

function newStore(): DeviceStore {
  return new DeviceStore(join(mkdtempSync(join(tmpdir(), 'workday-pairing-')), 'devices.json'))
}

function requestOf(result: ReturnType<Pairing['submit']>): PairingRequest {
  if (!result.ok) {
    throw new Error(`Expected a request, got ${result.reason}`)
  }
  return result.request
}

describe('Pairing', () => {
  it('submit returns the request when the code matches within five minutes', () => {
    const pairing = new Pairing(newStore())
    const code = pairing.open(NOW)

    const request = requestOf(pairing.submit(code.toLowerCase(), 'iPhone', minutesLater(4), PHONE))

    expect(request.name).toBe('iPhone')
    expect(request.ip).toBe('172.16.1.2')
    expect(request.email).toBe('me@example.com')
    expect(pairing.pending).toEqual(request)
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  })

  it('submit is refused after expiry', () => {
    const pairing = new Pairing(newStore())
    const code = pairing.open(NOW)

    const result = pairing.submit(
      code,
      'iPhone',
      new Date(minutesLater(5).getTime() + 1_000),
      PHONE,
    )

    expect(result).toEqual({ ok: false, reason: 'pairingClosed' })
    expect(pairing.isOpen(minutesLater(6))).toBe(false)
  })

  it('submit closes the window after five wrong codes', () => {
    const pairing = new Pairing(newStore())
    const code = pairing.open(NOW)

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(pairing.submit('WRONG1', 'iPhone', NOW, PHONE)).toEqual({
        ok: false,
        reason: 'wrongCode',
      })
    }

    expect(pairing.isOpen(NOW)).toBe(false)
    expect(pairing.submit(code, 'iPhone', NOW, PHONE).ok).toBe(false)
  })

  it('submit is refused while a request is pending and the code is single use', () => {
    const pairing = new Pairing(newStore())
    const code = pairing.open(NOW)
    requestOf(pairing.submit(code, 'iPhone', NOW, PHONE))

    expect(pairing.submit(code, 'iPad', NOW, PHONE).ok).toBe(false)
    pairing.reject()
    expect(pairing.pending).toBeNull()
    expect(pairing.submit(code, 'iPad', NOW, PHONE).ok).toBe(false)
  })

  it('approve returns the token once and the store keeps only its hash', async () => {
    const store = newStore()
    const pairing = new Pairing(store)
    const request = requestOf(pairing.submit(pairing.open(NOW), '  ', NOW, PHONE))

    const result = await pairing.approve(NOW)

    if (result === null) {
      throw new Error('Expected an approved device')
    }
    expect(pairing.pending).toBeNull()
    expect(result.device.name).toBe('Phone')
    expect(store.findByToken(result.token)?.id).toBe(result.device.id)
    expect(store.list()[0]?.tokenHash).not.toBe(result.token)
    expect(pairing.takeApproved(request.requestId)?.token).toBe(result.token)
    expect(pairing.takeApproved(request.requestId)).toBeNull()
  })

  it('two approves at once add one device', async () => {
    const store = newStore()
    const pairing = new Pairing(store)
    const request = requestOf(pairing.submit(pairing.open(NOW), 'iPhone', NOW, PHONE))

    const results = await Promise.all([pairing.approve(NOW), pairing.approve(NOW)])

    expect(results.filter((result) => result !== null)).toHaveLength(1)
    expect(store.list()).toHaveLength(1)
    expect(pairing.takeApproved(request.requestId)).not.toBeNull()
  })

  it('the request stays waiting while approve saves and comes back when the save fails', async () => {
    const store = newStore()
    const pairing = new Pairing(store)
    const request = requestOf(pairing.submit(pairing.open(NOW), 'iPhone', NOW, PHONE))
    vi.spyOn(store, 'add').mockRejectedValueOnce(new Error('disk full'))

    const approving = pairing.approve(NOW)
    const waitingDuringSave = pairing.isWaiting(request.requestId)

    await expect(approving).rejects.toThrow('disk full')
    expect(waitingDuringSave).toBe(true)
    expect(pairing.pending).toEqual(request)
    expect(store.list()).toEqual([])
  })
})
