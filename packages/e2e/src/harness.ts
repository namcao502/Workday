import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright-core'

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const SERVER_MAIN = join(REPO_ROOT, 'packages', 'server', 'dist', 'main.js')
const START_TIMEOUT_MS = 30_000
const POLL_MS = 250

export interface RunningApp {
  readonly baseUrl: string
  readonly dataDir: string
  readonly browser: Browser
  readonly newPage: () => Promise<Page>
  readonly stop: () => Promise<void>
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() => {
        if (address === null || typeof address === 'string') {
          reject(new Error('No port'))
          return
        }
        resolve(address.port)
      })
    })
  })
}

async function waitForHealth(baseUrl: string, server: ChildProcess): Promise<void> {
  const deadline = Date.now() + START_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`The server exited with code ${String(server.exitCode)}`)
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) {
        return
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
  throw new Error('The server did not answer /api/health in time')
}

// The built server on a free port with an empty data dir: no Jira, Teams, HRM or TSC, so nothing real is touched.
export async function startApp(): Promise<RunningApp> {
  const port = await freePort()
  const dataDir = mkdtempSync(join(tmpdir(), 'workday-e2e-'))
  writeFileSync(join(dataDir, 'config.json'), JSON.stringify({ port }))
  const output: string[] = []
  const server = spawn(process.execPath, [SERVER_MAIN], {
    cwd: REPO_ROOT,
    env: { ...process.env, WORKDAY_DATA_DIR: dataDir, WORKDAY_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (chunk: Buffer) => output.push(chunk.toString()))
  server.stderr.on('data', (chunk: Buffer) => output.push(chunk.toString()))
  const baseUrl = `http://127.0.0.1:${String(port)}`
  try {
    await waitForHealth(baseUrl, server)
  } catch (error) {
    server.kill()
    throw new Error(`${String(error)}\n${output.join('')}`, { cause: error })
  }
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  return {
    baseUrl,
    dataDir,
    browser,
    newPage: async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
      await page.goto(baseUrl)
      return page
    },
    stop: async () => {
      await browser.close()
      if (server.exitCode === null) {
        const exited = new Promise((resolve) => server.once('exit', resolve))
        server.kill()
        await exited
      }
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}
