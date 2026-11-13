import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createApp } from './app.js'
import { loadConfig, loadGraphTokenOverride } from './config.js'
import { resolveDataDir } from './dataDir.js'
import { HrmHoursLog } from './hrm/hrmHoursLog.js'
import { JiraTracker } from './jira/jiraTracker.js'
import { isLoopbackHost } from './security/allowedHosts.js'
import { createServices } from './services.js'
import { BrowserLock } from './tsc/browserLock.js'
import { GraphSheetLog } from './tsc/graphSheetLog.js'
import { PlaywrightTokenSource } from './tsc/tokenSniffer.js'

const LISTEN_HOST = '127.0.0.1'
const TSC_BROWSER_FOLDER = 'tsc-browser'

// WORKDAY_PORT (dev only) overrides the port in config.json.
function readPort(configPort: number): number {
  const raw = process.env['WORKDAY_PORT']
  if (raw === undefined || raw === '') return configPort
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`WORKDAY_PORT must be a port number, got "${raw}"`)
  }
  return port
}

function readVersion(): string {
  const packageJson = readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')
  const { version } = JSON.parse(packageJson) as { version: string }
  return version
}

async function main(): Promise<void> {
  const dataDir = resolveDataDir()
  const config = loadConfig(dataDir)
  if (!isLoopbackHost(config.host)) {
    console.error('Remote access is not available yet')
    process.exit(1)
  }

  const port = readPort(config.port)
  // One lock for every rebuilt sheet adapter: the browser profile allows a single Chrome.
  const browserLock = new BrowserLock()
  const browserProfileDir = join(dataDir, TSC_BROWSER_FOLDER)
  const services = createServices({
    dataDir,
    config,
    createTracker: (jira, token) => new JiraTracker(jira, token),
    createHoursLog: (hrm, apiKey) => new HrmHoursLog(hrm, apiKey),
    createSheetLog: (tsc) =>
      new GraphSheetLog(
        tsc,
        new PlaywrightTokenSource(tsc, browserProfileDir, browserLock),
        loadGraphTokenOverride(),
      ),
  })
  const app = await createApp({
    port,
    dev: process.env['WORKDAY_DEV'] === '1',
    version: readVersion(),
    clientDist: join(import.meta.dirname, '..', '..', 'client', 'dist'),
    ...services,
  })
  await app.listen({ host: LISTEN_HOST, port })
  services.workspace.setHookBase(`http://${LISTEN_HOST}:${String(port)}`)
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
    Promise.all([app.close(), services.remote.shutdown()]).then(
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
