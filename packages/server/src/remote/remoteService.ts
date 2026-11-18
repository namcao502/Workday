import { join } from 'node:path'
import {
  REMOTE_AREAS,
  type AccessLevel,
  type ActivityEntry,
  type DeviceRights,
  type PairingView,
  type PushSubscriptionJson,
  type RemoteConfig,
  type RemoteDevice,
  type RemoteStatusView,
  type VpnConfig,
  type VpnStatusView,
} from '@workday/core'
import { loadTunnelToken } from '../config.js'
import type { EventHub } from '../events.js'
import { AccessVerifier, type AccessIdentity, type AccessTokenVerifier } from './accessJwt.js'
import { ActivityLog } from './activityLog.js'
import { DeviceStore, type StoredDevice } from './deviceStore.js'
import { Pairing, type PairingIdentity, type SubmitResult } from './pairing.js'
import { readCaFingerprint } from './lanCertificates.js'
import type { LanListener } from './lanServer.js'
import { localIpv4Addresses } from './lanNetwork.js'
import { PushService, type SendPush } from './pushService.js'
import { TunnelSupervisor, type SpawnTunnel } from './tunnelSupervisor.js'

const DEVICES_FILE = 'devices.json'
const ACTIVITY_FILE = 'remote-activity.json'
const ACTIVITY_SHOWN = 50
const SETUP_CHECK_MS = 10_000
const LEVEL_RANK: Readonly<Record<AccessLevel, number>> = { off: 0, view: 1, act: 2 }

export interface RemoteServiceDeps {
  readonly dataDir: string
  readonly events: EventHub
  readonly now: () => Date
  // Tests pass their own; by default the real Cloudflare Access verifier.
  readonly createVerifier?: (remote: RemoteConfig) => AccessTokenVerifier
  // Tests pass their own; by default web-push, cloudflared and the token from env or secrets.json.
  readonly sendPush?: SendPush
  readonly localOrigin?: string | undefined // the app's origin on this PC, for local push links
  readonly spawnTunnel?: SpawnTunnel
  readonly loadTunnelToken?: () => string | null
  readonly logError?: (message: string, error: unknown) => void
}

export interface DeviceChanges {
  readonly name?: string
  readonly rights?: DeviceRights
  readonly pushEnabled?: boolean
}

export type PairingStatus =
  | { readonly status: 'waiting' | 'rejected' }
  | { readonly status: 'approved'; readonly token: string }

export function toRemoteDevice(device: StoredDevice): RemoteDevice {
  const { id, name, email, rights, pushEnabled, hasPushSubscription, createdAt, lastSeenAt } =
    device
  return { id, name, email, rights, pushEnabled, hasPushSubscription, createdAt, lastSeenAt }
}

function isDowngrade(before: DeviceRights, after: DeviceRights): boolean {
  return REMOTE_AREAS.some((area) => LEVEL_RANK[after[area]] < LEVEL_RANK[before[area]])
}

function createAccessVerifier(remote: RemoteConfig): AccessTokenVerifier {
  return new AccessVerifier({ teamDomain: remote.accessTeamDomain, aud: remote.accessAud })
}

const VPN_OFF: VpnStatusView = {
  server: 'off',
  serverDetail: null,
  addresses: [],
  httpsUrl: null,
  setupUrl: null,
  caFingerprint: null,
}

interface TunnelTarget {
  readonly path: string
  readonly token: string
}

// Owns the paired devices, the pairing window, the activity log, the Access verifier, push and the tunnel.
export class RemoteService {
  private remote: RemoteConfig | null = null
  private vpn: VpnConfig | null = null
  private verifier: AccessTokenVerifier | null = null
  private tunnelTarget: TunnelTarget | null = null
  private lan: LanListener | null = null
  private setupTimer: NodeJS.Timeout | null = null
  private readonly store: DeviceStore
  private readonly pairing: Pairing
  private readonly activity: ActivityLog
  private readonly tunnel: TunnelSupervisor
  readonly push: PushService

  constructor(private readonly deps: RemoteServiceDeps) {
    this.store = new DeviceStore(join(deps.dataDir, DEVICES_FILE))
    this.pairing = new Pairing(this.store)
    this.activity = new ActivityLog(join(deps.dataDir, ACTIVITY_FILE))
    this.tunnel = new TunnelSupervisor({
      ...(deps.spawnTunnel === undefined ? {} : { spawn: deps.spawnTunnel }),
      onChange: () => {
        this.changed()
      },
    })
    this.push = new PushService({
      dataDir: deps.dataDir,
      store: this.store,
      origin: () => this.pushOrigin(),
      localOrigin: deps.localOrigin,
      ...(deps.sendPush === undefined ? {} : { send: deps.sendPush }),
      ...(deps.logError === undefined ? {} : { logError: deps.logError }),
    })
  }

  get config(): RemoteConfig | null {
    return this.remote
  }

  get vpnConfig(): VpnConfig | null {
    return this.vpn
  }

  // Turning VPN off closes only the sockets that came through it.
  configureVpn(vpn: VpnConfig | null): void {
    this.vpn = vpn
    if (vpn === null || !vpn.enabled) {
      this.deps.events.closeAllDevices('vpn')
    }
    this.applyLan(vpn)
  }

  // Starts the listener from the config loaded before the server was up.
  attachLan(lan: LanListener): void {
    this.lan = lan
    this.applyLan(this.vpn)
  }

  // The verifier is rebuilt only when the team or aud changes, so its certs cache survives other edits.
  configure(remote: RemoteConfig | null): void {
    const previous = this.remote
    this.remote = remote
    if (remote === null || !remote.enabled) {
      this.deps.events.closeAllDevices()
    }
    if (remote === null) {
      this.verifier = null
    } else if (
      this.verifier === null ||
      previous?.accessTeamDomain !== remote.accessTeamDomain ||
      previous.accessAud !== remote.accessAud
    ) {
      this.verifier = (this.deps.createVerifier ?? createAccessVerifier)(remote)
    }
    this.applyTunnel(remote)
  }

  // Waits for the tunnel process to exit; called when the server shuts down.
  async shutdown(): Promise<void> {
    this.tunnelTarget = null
    this.stopSetupWatch()
    await this.tunnel.stop()
  }

  async verifyAccess(token: string): Promise<AccessIdentity | null> {
    return this.verifier === null ? null : this.verifier.verify(token)
  }

  findDevice(token: string): StoredDevice | null {
    return this.store.findByToken(token)
  }

  markSeen(device: StoredDevice): void {
    this.store.touch(device.id, this.deps.now()).catch((error: unknown) => {
      this.logError('Saving lastSeenAt failed', error)
    })
  }

  status(): RemoteStatusView {
    const tunnel = this.tunnel.status()
    return {
      tunnel: tunnel.state,
      tunnelDetail: tunnel.detail,
      devices: this.store.list().map(toRemoteDevice),
      pairing: this.pairing.view(this.deps.now()),
      activity: this.activity.latest(ACTIVITY_SHOWN),
      vapidPublicKey: this.push.peekPublicKey(),
      vpn: this.vpnStatus(),
    }
  }

  openPairing(): PairingView {
    const now = this.deps.now()
    this.pairing.open(now)
    this.startSetupWatch()
    this.changed()
    return this.pairing.view(now)
  }

  submitPairing(code: string, name: string, identity: PairingIdentity): SubmitResult {
    const result = this.pairing.submit(code, name, this.deps.now(), identity)
    if (result.ok) {
      this.changed()
    }
    return result
  }

  // The token leaves the server once, on the first poll after approval.
  pairingStatus(requestId: string): PairingStatus {
    if (this.pairing.isWaiting(requestId)) {
      return { status: 'waiting' }
    }
    const approved = this.pairing.takeApproved(requestId)
    return approved === null
      ? { status: 'rejected' }
      : { status: 'approved', token: approved.token }
  }

  // False when no request is waiting.
  async approvePairing(): Promise<boolean> {
    const added = await this.pairing.approve(this.deps.now())
    if (added === null) {
      return false
    }
    this.checkSetup()
    this.changed()
    return true
  }

  rejectPairing(): boolean {
    if (this.pairing.pending === null) {
      return false
    }
    this.pairing.reject()
    this.checkSetup()
    this.changed()
    return true
  }

  // False when the device is unknown.
  async updateDevice(id: string, changes: DeviceChanges): Promise<boolean> {
    const before = this.store.list().find((device) => device.id === id)
    if (before === undefined) {
      return false
    }
    if (changes.name !== undefined) {
      await this.store.rename(id, changes.name)
    }
    const { rights, pushEnabled } = changes
    if (rights !== undefined || pushEnabled !== undefined) {
      await this.store.update(id, (device) => ({
        ...device,
        rights: rights ?? device.rights,
        pushEnabled: pushEnabled ?? device.pushEnabled,
      }))
    }
    if (rights !== undefined && isDowngrade(before.rights, rights)) {
      this.deps.events.closeDevice(id)
    }
    this.changed()
    return true
  }

  // This device's push subscription; null turns push off. False when the device is gone.
  async setPushSubscription(
    id: string,
    subscription: PushSubscriptionJson | null,
  ): Promise<boolean> {
    const updated = await this.store.update(id, (device) => ({
      ...device,
      pushSubscription: subscription,
      pushEnabled: subscription !== null,
    }))
    if (updated === null) {
      return false
    }
    this.changed()
    return true
  }

  async revokeDevice(id: string): Promise<boolean> {
    const removed = await this.store.remove(id)
    if (removed) {
      this.deps.events.closeDevice(id)
      this.changed()
    }
    return removed
  }

  record(entry: Omit<ActivityEntry, 'at'>): void {
    this.activity.add({ at: this.deps.now().toISOString(), ...entry }).then(
      () => {
        this.changed()
      },
      (error: unknown) => {
        this.logError('Saving the remote activity failed', error)
      },
    )
  }

  // Runs only while remote is enabled with a binary path and a token.
  private applyTunnel(remote: RemoteConfig | null): void {
    const path = remote !== null && remote.enabled ? remote.cloudflaredPath : null
    const token = path === null ? null : (this.deps.loadTunnelToken ?? this.readTunnelToken)()
    const previous = this.tunnelTarget
    if (path === null || token === null) {
      if (previous !== null) {
        this.tunnelTarget = null
        this.tunnel.stop().catch((error: unknown) => {
          this.logError('Stopping the tunnel failed', error)
        })
      }
      return
    }
    // A failed tunnel (e.g. no binary) is retried on every configure.
    const changed = previous === null || previous.path !== path || previous.token !== token
    if (changed || this.tunnel.status().state === 'failed') {
      this.tunnelTarget = { path, token }
      this.tunnel.start(path, token)
    }
  }

  private applyLan(vpn: VpnConfig | null): void {
    this.lan?.apply(vpn).catch((error: unknown) => {
      this.logError('Applying the VPN settings failed', error)
    })
  }

  private vpnStatus(): VpnStatusView {
    return this.lan === null
      ? {
          ...VPN_OFF,
          addresses: localIpv4Addresses(),
          caFingerprint: readCaFingerprint(this.deps.dataDir),
        }
      : this.lan.status()
  }

  // Cloudflare first, then the VPN address; null when neither is on.
  private pushOrigin(): string | null {
    if (this.remote !== null && this.remote.enabled) {
      return `https://${this.remote.publicHost}`
    }
    if (this.vpn !== null && this.vpn.enabled) {
      return `https://${this.vpn.address}:${String(this.vpn.httpsPort)}`
    }
    return null
  }

  // The setup page is open while a pairing window or a waiting request needs it.
  private startSetupWatch(): void {
    if (this.lan === null) {
      return
    }
    this.setSetupOpen(true)
    if (this.setupTimer === null) {
      this.setupTimer = setInterval(() => {
        this.checkSetup()
      }, SETUP_CHECK_MS)
      this.setupTimer.unref()
    }
  }

  private checkSetup(): void {
    if (this.setupTimer === null) {
      return
    }
    if (!this.pairing.isOpen(this.deps.now()) && this.pairing.pending === null) {
      this.stopSetupWatch()
      this.setSetupOpen(false)
    }
  }

  private stopSetupWatch(): void {
    if (this.setupTimer !== null) {
      clearInterval(this.setupTimer)
      this.setupTimer = null
    }
  }

  private setSetupOpen(open: boolean): void {
    this.lan?.setSetupOpen(open).catch((error: unknown) => {
      this.logError('Changing the VPN setup page failed', error)
    })
  }

  private readonly readTunnelToken = (): string | null => loadTunnelToken(this.deps.dataDir).token

  private changed(): void {
    this.deps.events.broadcast({ type: 'remote.changed' })
  }

  private logError(message: string, error: unknown): void {
    const logError = this.deps.logError ?? console.error
    logError(message, error)
  }
}
