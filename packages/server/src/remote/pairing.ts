import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import type { PairingView } from '@workday/core'
import { normalizeDeviceName, type AddedDevice, type DeviceStore } from './deviceStore.js'

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6
export const MAX_WRONG_CODES = 5
const WINDOW_MS = 5 * 60_000
const DEFAULT_DEVICE_NAME = 'Phone'

export interface PairingRequest {
  readonly requestId: string
  readonly name: string
  readonly email: string | null
  readonly ip: string | null
  readonly at: string
}

export interface PairingIdentity {
  readonly email: string | null
  readonly ip: string | null
}

export type SubmitResult =
  | { readonly ok: true; readonly request: PairingRequest }
  | { readonly ok: false; readonly reason: 'pairingClosed' | 'wrongCode' }

// From MobilePairing.cs: the PC shows a code, the phone submits it, the PC approves,
// then the phone's next poll takes the token once.
export class Pairing {
  private code: string | null = null
  private expiresAt = 0
  private wrongCodeCount = 0
  private pendingRequest: PairingRequest | null = null
  // Taken off pending while its device is saved, so a second approve finds nothing.
  private approving: PairingRequest | null = null
  private readonly approvedByRequestId = new Map<string, AddedDevice>()

  constructor(private readonly store: DeviceStore) {}

  get pending(): PairingRequest | null {
    return this.pendingRequest
  }

  open(now: Date): string {
    const characters = Array.from(
      { length: CODE_LENGTH },
      () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)] ?? '',
    )
    this.code = characters.join('')
    this.expiresAt = now.getTime() + WINDOW_MS
    this.wrongCodeCount = 0
    this.pendingRequest = null
    this.approvedByRequestId.clear()
    return this.code
  }

  isOpen(now: Date): boolean {
    return (
      this.code !== null && now.getTime() <= this.expiresAt && this.wrongCodeCount < MAX_WRONG_CODES
    )
  }

  // The code works once, so a match spends it.
  submit(code: string, name: string, now: Date, identity: PairingIdentity): SubmitResult {
    const expected = this.code
    if (expected === null || !this.isOpen(now) || this.pendingRequest !== null) {
      return { ok: false, reason: 'pairingClosed' }
    }
    const given = Buffer.from(code.trim().toUpperCase(), 'utf8')
    const wanted = Buffer.from(expected, 'utf8')
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
      this.wrongCodeCount += 1
      return { ok: false, reason: 'wrongCode' }
    }
    this.code = null
    const deviceName = normalizeDeviceName(name)
    this.pendingRequest = {
      requestId: randomUUID().replaceAll('-', ''),
      name: deviceName === '' ? DEFAULT_DEVICE_NAME : deviceName,
      email: identity.email,
      ip: identity.ip,
      at: now.toISOString(),
    }
    return { ok: true, request: this.pendingRequest }
  }

  // Adds the device and keeps its token for exactly one takeApproved call; null when nothing waits.
  async approve(now: Date): Promise<AddedDevice | null> {
    const request = this.pendingRequest
    if (request === null) {
      return null
    }
    this.pendingRequest = null
    this.approving = request
    try {
      const added = await this.store.add(request.name, now, request.email)
      this.approvedByRequestId.set(request.requestId, added)
      return added
    } catch (error: unknown) {
      this.pendingRequest ??= request
      throw error
    } finally {
      this.approving = null
    }
  }

  // True while the request waits for the PC, including while its approval is being saved.
  isWaiting(requestId: string): boolean {
    return this.pendingRequest?.requestId === requestId || this.approving?.requestId === requestId
  }

  reject(): void {
    this.pendingRequest = null
  }

  // The phone's poll: the approved result for its request, once; null after that or for an unknown id.
  takeApproved(requestId: string): AddedDevice | null {
    const result = this.approvedByRequestId.get(requestId) ?? null
    this.approvedByRequestId.delete(requestId)
    return result
  }

  view(now: Date): PairingView {
    const isOpen = this.isOpen(now)
    const request = this.pendingRequest
    return {
      code: isOpen ? this.code : null,
      expiresAt: isOpen ? new Date(this.expiresAt).toISOString() : null,
      pending:
        request === null
          ? null
          : { name: request.name, email: request.email, ip: request.ip, at: request.at },
    }
  }
}
