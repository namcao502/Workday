import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createApp } from './app.js'
import { applyPendingImport } from './backup/pendingImport.js'
import { loadConfig, loadGraphTokenOverride, readPort } from './config.js'
import { resolveDataDir } from './dataDir.js'
import { HrmHoursLog } from './hrm/hrmHoursLog.js'
import { JiraTracker } from './jira/jiraTracker.js'
import { LanServer } from './remote/lanServer.js'
import { isLoopbackHost, localAppOrigin } from './security/allowedHosts.js'
import { createServices } from './services.js'
import { BrowserLock } from './tsc/browserLock.js'
import { fileGraphTokenStore } from './tsc/graphTokenStore.js'
import { GraphSheetLog } from './tsc/graphSheetLog.js'
import { PlaywrightTokenSource } from './tsc/tokenSniffer.js'
import { logServerLife } from './serverLifeLog.js'

const LISTEN_HOST = '127.0.0.1'
const TSC_BROWSER_FOLDER = 'tsc-browser'

function readVersion(): string {
  const packageJson = readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')
  const { version } = JSON.parse(packageJson) as { version: string }
  return version
}

// SIGHUP: the console closed; SIGBREAK: Ctrl+Break. Both used to end the server with no trace.
const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] as const

function watchServerLife(dataDir: string): void {
  // The monitor only observes: the crash still ends the process as before.
  process.on('uncaughtExceptionMonitor', (error, origin) => {
    logServerLife(dataDir, `${origin}: ${error.stack ?? String(error)}`, new Date())
  })
  process.on('exit', (code) => {
    logServerLife(dataDir, `exit code ${String(code)}`, new Date())
  })
}

async function main(): Promise<void> {
  const dataDir = resolveDataDir()
  watchServerLife(dataDir)
  applyPendingImport(dataDir, new Date(), (message) => {
    console.log(message)
  })
  const config = loadConfig(dataDir)
  if (!isLoopbackHost(config.host)) {
    console.error('Remote access is not available yet')
    process.exit(1)
  }

  const port = readPort(config.port)
  // One lock for every rebuilt sheet adapter: the browser profile allows a single browser.
  const browserLock = new BrowserLock()
  const browserProfileDir = join(dataDir, TSC_BROWSER_FOLDER)
  const dev = process.env['WORKDAY_DEV'] === '1'
  const services = createServices({
    dataDir,
    config,
    localOrigin: localAppOrigin({ port, dev }),
    createTracker: (jira, token) => new JiraTracker(jira, token),
    createHoursLog: (hrm, apiKey) => new HrmHoursLog(hrm, apiKey),
    createSheetLog: (tsc) =>
      new GraphSheetLog(
        tsc,
        new PlaywrightTokenSource(tsc, browserProfileDir, browserLock),
        loadGraphTokenOverride(),
        fetch,
        fileGraphTokenStore(dataDir),
      ),
  })
  const appDeps = {
    port,
    dev,
    dataDir,
    version: readVersion(),
    clientDist: join(import.meta.dirname, '..', '..', 'client', 'dist'),
    ...services,
  }
  const app = await createApp(appDeps)
  const lan = new LanServer({
    dataDir,
    now: () => new Date(),
    createApp: (vpn) => createApp({ ...appDeps, vpn }),
    language: () => services.settings.language,
    onChange: () => {
      services.events.broadcast({ type: 'remote.changed' })
    },
    logError: (message, error) => {
      console.error(message, error)
    },
  })
  await app.listen({ host: LISTEN_HOST, port })
  services.remote.attachLan(lan)
  services.settings.start()
  services.timesheet.catchUp().catch((error: unknown) => {
    console.error('Startup catch-up failed', error)
  })

  logServerLife(dataDir, `started pid ${String(process.pid)} port ${String(port)}`, new Date())

  const shutdown = (signal: NodeJS.Signals): void => {
    logServerLife(dataDir, `received ${signal}, shutting down`, new Date())
    services.scheduler.stop()
    services.prScheduler.stop()
    services.teamsScheduler.stop()
    services.logScheduler.stop()
    services.scanRunner.stop()
    services.workspace.shutdown()
    Promise.all([app.close(), lan.stop(), services.remote.shutdown()]).then(
      () => process.exit(0),
      (error: unknown) => {
        console.error(error)
        process.exit(1)
      },
    )
  }
  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, shutdown)
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
