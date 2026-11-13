import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSecrets } from '../config.js'
import { buildTestApp, LOOPBACK_HEADERS, type TestApp } from '../testing/testApp.js'

const ADO = {
  organization: 'acme',
  project: 'Shop',
  repoLabels: { Backend: 'BE' },
  devPipelineFolder: null,
}
const PAT = 'ado-secret-pat'

const openApps: FastifyInstance[] = []

beforeEach(() => {
  vi.stubEnv('WORKDAY_JIRA_API_TOKEN', '')
  vi.stubEnv('WORKDAY_HRM_API_KEY', '')
  vi.stubEnv('WORKDAY_TUNNEL_TOKEN', '')
  vi.stubEnv('WORKDAY_ADO_PAT', '')
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

async function newApp(): Promise<TestApp> {
  const testApp = await buildTestApp()
  openApps.push(testApp.app)
  return testApp
}

function send(
  testApp: TestApp,
  method: 'PUT' | 'POST',
  url: string,
  payload: Record<string, unknown>,
): Promise<LightMyRequestResponse> {
  return testApp.app.inject({ method, url, headers: LOOPBACK_HEADERS, payload })
}

describe('Azure DevOps settings', () => {
  it('settings never write the ADO PAT into config.json', async () => {
    const testApp = await newApp()

    const response = await send(testApp, 'PUT', '/api/settings', { azureDevOps: ADO, adoPat: PAT })

    expect(response.statusCode).toBe(200)
    expect(response.body).not.toContain(PAT)
    expect(response.json()).toMatchObject({ adoPatSource: 'file', config: { azureDevOps: ADO } })
    expect(readFileSync(join(testApp.dataDir, 'config.json'), 'utf8')).not.toContain(PAT)
    expect(readFileSync(join(testApp.dataDir, 'secrets.json'), 'utf8')).not.toContain(PAT)
    expect(readFileSecrets(testApp.dataDir).adoPat).toBe(PAT)
    expect(testApp.pullRequestsCalls).toEqual([{ config: ADO, pat: PAT }])
    expect(testApp.services.settings.pullRequests).toBe(testApp.pullRequests)
  })

  it('starts the PR check when a client appears and stops it when removed', async () => {
    const testApp = await newApp()
    const stopsBefore = testApp.prSchedulerStops.count

    await send(testApp, 'PUT', '/api/settings', { azureDevOps: ADO, adoPat: PAT })
    expect(testApp.prSchedulerStarts).toEqual([5])
    await send(testApp, 'PUT', '/api/settings', { azureDevOps: null })

    expect(testApp.prSchedulerStarts).toEqual([5])
    expect(testApp.prSchedulerStops.count).toBe(stopsBefore + 1)
  })

  it('has no client until both the config and the PAT exist', async () => {
    const testApp = await newApp()

    await send(testApp, 'PUT', '/api/settings', { azureDevOps: ADO })

    expect(testApp.services.settings.pullRequests).toBeNull()
    expect(testApp.pullRequestsCalls).toEqual([])
  })

  it('rejects an azureDevOps block without a project', async () => {
    const testApp = await newApp()

    const response = await send(testApp, 'PUT', '/api/settings', {
      azureDevOps: { organization: 'acme' },
    })

    expect(response.statusCode).toBe(400)
  })

  it('the saved PAT is never sent to another organization', async () => {
    const testApp = await newApp()
    await send(testApp, 'PUT', '/api/settings', { azureDevOps: ADO, adoPat: PAT })
    const callsBefore = testApp.pullRequestsCalls.length
    const check = (payload: Record<string, unknown>): Promise<LightMyRequestResponse> =>
      send(testApp, 'POST', '/api/settings/ado/check', payload)

    const other = await check({ organization: 'evil', project: 'Shop' })
    const same = await check({ organization: 'acme', project: 'Other' })
    const moved = await send(testApp, 'PUT', '/api/settings', {
      azureDevOps: { ...ADO, organization: 'evil' },
    })

    expect(other.statusCode).toBe(400)
    expect(same.json()).toEqual({ ok: true, displayName: 'Test User' })
    expect(moved.statusCode).toBe(400)
    expect(testApp.pullRequestsCalls.slice(callsBefore)).toEqual([
      { config: { ...ADO, project: 'Other' }, pat: PAT },
    ])
  })

  it('the check maps a rejected PAT to adoRejected', async () => {
    const testApp = await newApp()
    testApp.pullRequests.validation = { ok: false, reason: 'rejected' }

    const response = await send(testApp, 'POST', '/api/settings/ado/check', {
      organization: 'acme',
      project: 'Shop',
      adoPat: 'typed-pat',
    })

    expect(response.json()).toEqual({ ok: false, error: { code: 'adoRejected' } })
  })
})
