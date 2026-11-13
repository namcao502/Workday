import { readFileSync } from 'node:fs'
import { NetworkFailure, type AzureDevOpsConfig } from '@workday/core'
import { describe, expect, it, vi } from 'vitest'
import { AzureDevOpsClient } from './adoClient.js'

const CONFIG: AzureDevOpsConfig = {
  organization: 'acme',
  project: 'Shop',
  repoLabels: { Backend: 'BE' },
  devPipelineFolder: '\\Development-Pipelines',
}

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
}

function respond(status: number, body: string, contentType = 'application/json'): Response {
  return new Response(body, { status, headers: { 'Content-Type': contentType } })
}

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>

function urlOf(call: Parameters<typeof fetch>): string {
  return typeof call[0] === 'string' ? call[0] : ''
}

function fakeAzure(): FetchMock {
  return vi.fn<typeof fetch>((input) => {
    const url = typeof input === 'string' ? input : ''
    if (url.includes('connectionData')) {
      return Promise.resolve(respond(200, '{"authenticatedUser":{"id":"me"}}'))
    }
    if (url.includes('sourceRefName=refs%2Fheads%2FMDP-1-dev')) {
      return Promise.resolve(respond(500, '{}'))
    }
    if (url.includes('sourceRefName=refs%2Fheads%2FMDP-1&')) {
      return Promise.resolve(respond(200, fixture('pullrequests.json')))
    }
    if (url.includes('/threads')) {
      return Promise.resolve(respond(200, fixture('threads.json')))
    }
    return Promise.resolve(respond(200, '{"value":[]}'))
  })
}

describe('ticketPrs', () => {
  it('keeps only my PRs and marks a failed branch incomplete', async () => {
    const fetchMock = fakeAzure()
    const lookup = await new AzureDevOpsClient(CONFIG, 'secret-pat', fetchMock).ticketPrs('MDP-1')

    expect(lookup.complete).toBe(false)
    expect(lookup.prs.map((pr) => [pr.branch, pr.pullRequestId, pr.commentCount])).toEqual([
      ['main', 101, 5],
      ['main', 102, 5],
    ])
    const searches = fetchMock.mock.calls.map(urlOf).filter((url) => url.includes('/pullrequests?'))
    expect(searches.length).toBe(2)
    expect(searches.every((url) => url.includes('searchCriteria.creatorId=me'))).toBe(true)
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(headers.get('Authorization')).toBe(
      `Basic ${Buffer.from(':secret-pat').toString('base64')}`,
    )
    expect(urlOf(fetchMock.mock.calls[0] ?? [''])).toContain('https://dev.azure.com/acme/')
  })

  it('throws NetworkFailure when fetch rejects', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')))
    await expect(new AzureDevOpsClient(CONFIG, 'pat', fetchMock).ticketPrs('MDP-1')).rejects.toThrow(
      NetworkFailure,
    )
  })

  it('throws, never reading unfiltered, when the user id cannot be read', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(respond(500, '{}')))
    const client = new AzureDevOpsClient(CONFIG, 'pat', fetchMock)
    await expect(client.ticketPrs('MDP-1')).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('validate', () => {
  it('reads rejected from 401 and unreachable from no response', async () => {
    const rejected = vi.fn<typeof fetch>(() => Promise.resolve(respond(401, '')))
    expect(await new AzureDevOpsClient(CONFIG, 'pat', rejected).validate()).toEqual({
      ok: false,
      reason: 'rejected',
    })
    const down = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')))
    expect(await new AzureDevOpsClient(CONFIG, 'pat', down).validate()).toEqual({
      ok: false,
      reason: 'unreachable',
    })
  })
})

describe('devDeployBuilds', () => {
  it('is empty without a pipeline folder and makes no request', async () => {
    const fetchMock = fakeAzure()
    const client = new AzureDevOpsClient({ ...CONFIG, devPipelineFolder: null }, 'pat', fetchMock)
    expect(await client.devDeployBuilds('2026-10-20T00:00:00Z')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
