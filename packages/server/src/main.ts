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

const LISTEN_HOST = '127.0.0.1'
const TSC_BROWSER_FOLDER = 'tsc-browser'

function readVersion(): string {
  const packageJson = readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')
  const { version } = JSON.parse(packageJson) as { version: string }
  return version
}

async function main(): Promise<void> {
  const dataDir = resolveDataDir()
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

  const shutdown = (): void => {
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
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
