import { readFileSync } from 'node:fs'
import { request } from 'node:http'
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, beforeEach, afterEach, expect, it } from 'vitest'
import { startApp, type RunningApp } from './harness.js'

let app: RunningApp
let page: Page

beforeAll(async () => {
  app = await startApp()
})

afterAll(async () => {
  await app.stop()
})

beforeEach(async () => {
  page = await app.newPage()
})

afterEach(async () => {
  await page.close()
})

async function open(hash: string): Promise<void> {
  await page.goto(`${app.baseUrl}/${hash}`)
}

function pageTitle(name: string): ReturnType<Page['getByRole']> {
  return page.getByRole('heading', { level: 1, name, exact: true })
}

// A raw request, since fetch drops a hand-set Host header.
function statusWithHost(host: string): Promise<number> {
  const url = new URL(`${app.baseUrl}/api/health`)
  return new Promise((resolve, reject) => {
    const sent = request(
      { hostname: url.hostname, port: url.port, path: url.pathname, headers: { host } },
      (response) => {
        response.resume()
        resolve(response.statusCode ?? 0)
      },
    )
    sent.on('error', reject)
    sent.end()
  })
}

it('every page opens from the sidebar', async () => {
  await expect.poll(() => pageTitle('Tickets').isVisible()).toBe(true)
  const nav = page.getByRole('navigation', { name: 'Pages' })
  for (const name of ['Workspace', 'Timesheet', 'Insights', 'Settings', 'Tickets']) {
    await nav.getByRole('button', { name }).click()
    await expect.poll(() => pageTitle(name).isVisible()).toBe(true)
  }
})

it('Tickets without Jira points to the Jira settings', async () => {
  await open('#/tickets')
  await page.getByText('Jira is not connected yet.').waitFor()
  await page.getByRole('button', { name: 'Open Settings' }).click()
  await page.getByRole('heading', { level: 2, name: 'Jira', exact: true }).waitFor()
  expect(page.url()).toContain('#/settings/jira')
})

it('Timesheet without HRM and TSC says so and points to the timesheet settings', async () => {
  await open('#/timesheet')
  await page.getByText('TSC is not connected - open Settings').waitFor()
  await page.getByText('HRM is not connected - open Settings').waitFor()
  await page.getByRole('button', { name: 'Open Settings' }).first().click()
  await page.getByRole('heading', { level: 2, name: 'Timesheet', exact: true }).waitFor()
  expect(page.url()).toContain('#/settings/timesheet')
})

it('the settings search finds an entry in another group', async () => {
  await open('#/settings')
  await page.getByRole('heading', { level: 2, name: 'Appearance', exact: true }).waitFor()
  await page.getByRole('searchbox', { name: 'Search settings' }).fill('jql')
  await page.getByRole('heading', { level: 2, name: 'Jira', exact: true }).waitFor()
  expect(await page.getByRole('heading', { level: 2, name: 'Appearance' }).count()).toBe(0)
})

it('a language change is saved to config.json and survives a reload', async () => {
  await open('#/settings/appearance')
  await page.getByRole('radio', { name: 'Tiếng Việt' }).click()
  await expect.poll(() => pageTitle('Cài đặt').isVisible()).toBe(true)
  const config = JSON.parse(readFileSync(join(app.dataDir, 'config.json'), 'utf8')) as {
    language?: string
  }
  expect(config.language).toBe('vi')
  await page.reload()
  await expect.poll(() => pageTitle('Cài đặt').isVisible()).toBe(true)
  await page.getByRole('radio', { name: 'English' }).click()
  await expect.poll(() => pageTitle('Settings').isVisible()).toBe(true)
})

it('the server refuses a foreign Host header', async () => {
  expect(await statusWithHost(new URL(app.baseUrl).host)).toBe(200)
  expect(await statusWithHost('evil.example.com')).toBe(403)
})
