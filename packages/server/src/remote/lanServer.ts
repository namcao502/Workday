import type { VpnConfig, VpnStatusView, WorkdayConfig } from '@workday/core'
import type { FastifyInstance } from 'fastify'
import { loadOrCreateLanTls, readCaFingerprint } from './lanCertificates.js'
import { localIpv4Addresses } from './lanNetwork.js'
import type { VpnSurface } from './remoteGate.js'
import { SetupServer } from './setupServer.js'

const RENEW_CHECK_MS = 86_400_000
// The VPN address may come up after Workday starts (autostart at logon), so a failed listen retries.
const RETRY_MS = 30_000

export interface LanListener {
  apply(vpn: VpnConfig | null): Promise<void>
  setSetupOpen(open: boolean): Promise<void>
  status(): VpnStatusView
  stop(): Promise<void>
}

export interface LanServerDeps {
  readonly dataDir: string
  readonly now: () => Date
  readonly createApp: (surface: VpnSurface) => Promise<FastifyInstance>
  readonly setup?: Pick<SetupServer, 'open' | 'close'> // tests pass a fake
  readonly language: () => WorkdayConfig['language']
  readonly onChange: () => void // broadcasts remote.changed
  readonly logError: (message: string, error: unknown) => void
}

interface SecureContextTarget {
  setSecureContext(options: { key: string; cert: string }): void
}

interface Running {
  readonly app: FastifyInstance
  readonly address: string
  readonly httpsPort: number
  readonly timer: NodeJS.Timeout
}

// The app's server is a plain http.Server in the types; only the VPN instance is https.
function hasSecureContext(server: object): server is SecureContextTarget {
  return 'setSecureContext' in server && typeof server.setSecureContext === 'function'
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// The VPN HTTPS instance and its setup page. Every change runs through one Promise chain.
export class LanServer implements LanListener {
  private chain: Promise<void> = Promise.resolve()
  private readonly setup: Pick<SetupServer, 'open' | 'close'>
  private config: VpnConfig | null = null
  private running: Running | null = null
  private state: VpnStatusView['server'] = 'off'
  private detail: string | null = null
  private setupWanted = false
  private retryTimer: NodeJS.Timeout | null = null

  constructor(private readonly deps: LanServerDeps) {
    this.setup = deps.setup ?? new SetupServer()
  }

  apply(vpn: VpnConfig | null): Promise<void> {
    return this.enqueue(() => this.doApply(vpn))
  }

  setSetupOpen(open: boolean): Promise<void> {
    return this.enqueue(() => {
      this.setupWanted = open
      return this.syncSetup()
    })
  }

  status(): VpnStatusView {
    const config = this.config !== null && this.config.enabled ? this.config : null
    return {
      server: this.state,
      serverDetail: this.detail,
      addresses: localIpv4Addresses(),
      httpsUrl: config === null ? null : `https://${config.address}:${String(config.httpsPort)}`,
      setupUrl:
        config === null ? null : `http://${config.address}:${String(config.setupPort)}/setup`,
      caFingerprint: readCaFingerprint(this.deps.dataDir),
    }
  }

  stop(): Promise<void> {
    return this.apply(null)
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const next = this.chain.then(task)
    this.chain = next.catch(() => undefined)
    return next
  }

  private async doApply(vpn: VpnConfig | null): Promise<void> {
    this.cancelRetry()
    this.config = vpn
    if (vpn === null || !vpn.enabled) {
      await this.stopListener()
      await this.setup.close()
      this.setState('off', null)
      return
    }
    const current = this.running
    if (
      current !== null &&
      current.address === vpn.address &&
      current.httpsPort === vpn.httpsPort
    ) {
      await this.syncSetup()
      return
    }
    await this.stopListener()
    this.setState('starting', null)
    await this.start(vpn)
    await this.syncSetup()
  }

  private async start(vpn: VpnConfig): Promise<void> {
    let app: FastifyInstance | null = null
    try {
      const tls = await loadOrCreateLanTls(this.deps.dataDir, vpn.address, this.deps.now())
      const host = `${vpn.address}:${String(vpn.httpsPort)}`
      app = await this.deps.createApp({
        host,
        origin: `https://${host}`,
        tls: { key: tls.key, cert: tls.cert },
      })
      await app.listen({ host: vpn.address, port: vpn.httpsPort })
      const timer = setInterval(() => {
        void this.renew(vpn.address)
      }, RENEW_CHECK_MS)
      timer.unref()
      this.running = { app, address: vpn.address, httpsPort: vpn.httpsPort, timer }
      this.setState('running', null)
    } catch (error: unknown) {
      if (app !== null) {
        await this.closeApp(app)
      }
      this.setState('failed', messageOf(error))
      this.scheduleRetry(vpn)
    }
  }

  private scheduleRetry(vpn: VpnConfig): void {
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.enqueue(() => this.retry(vpn))
    }, RETRY_MS)
    this.retryTimer.unref()
  }

  // Skipped when the config changed or a listener already runs: that apply owns the state now.
  private async retry(vpn: VpnConfig): Promise<void> {
    if (this.config !== vpn || this.running !== null) {
      return
    }
    await this.start(vpn)
    await this.syncSetup()
  }

  private cancelRetry(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }

  // A renewed cert reaches new connections through the server's secure context, no restart.
  private async renew(address: string): Promise<void> {
    const current = this.running
    if (current === null || current.address !== address) {
      return
    }
    try {
      const tls = await loadOrCreateLanTls(this.deps.dataDir, address, this.deps.now())
      if (tls.renewed && hasSecureContext(current.app.server)) {
        current.app.server.setSecureContext({ key: tls.key, cert: tls.cert })
      }
    } catch (error: unknown) {
      this.deps.logError('Renewing the VPN certificate failed', error)
    }
  }

  private async stopListener(): Promise<void> {
    const current = this.running
    this.running = null
    if (current !== null) {
      clearInterval(current.timer)
      await this.closeApp(current.app)
    }
  }

  private async closeApp(app: FastifyInstance): Promise<void> {
    try {
      await app.close()
    } catch (error: unknown) {
      this.deps.logError('Closing the VPN listener failed', error)
    }
  }

  // Open only while the HTTPS listener runs and pairing asks for it; a failure is logged, not thrown.
  private async syncSetup(): Promise<void> {
    const config = this.config
    try {
      if (this.setupWanted && this.state === 'running' && config !== null) {
        await this.setup.open({
          address: config.address,
          port: config.setupPort,
          httpsUrl: `https://${config.address}:${String(config.httpsPort)}`,
          allowedRanges: config.allowedRanges,
          tls: () => loadOrCreateLanTls(this.deps.dataDir, config.address, this.deps.now()),
          language: this.deps.language,
        })
      } else {
        await this.setup.close()
      }
    } catch (error: unknown) {
      this.deps.logError('Opening the VPN setup page failed', error)
    }
  }

  private setState(state: VpnStatusView['server'], detail: string | null): void {
    this.state = state
    this.detail = detail
    this.deps.onChange()
  }
}
