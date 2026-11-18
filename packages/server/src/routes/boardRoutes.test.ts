import { afterEach, describe, expect, it } from 'vitest'
import type { JiraConfig } from '@workday/core'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { join } from 'node:path'
import { saveBoard } from '../boardStore.js'
import { writeJsonAtomic } from '../jsonFile.js'
import { boardWith, makeTicket } from '../testing/fakes.js'
import { buildTestApp, LOOPBACK_HEADERS, newDataDir } from '../testing/testApp.js'

const JIRA: JiraConfig = {
  baseUrl: 'https://jira.example',
  email: 'me@example.com',
  projectKey: 'MDP',
  assignedJql: 'assignee = currentUser()',
  mineJql: 'assignee = currentUser()',
  maxResults: 50,
  etaFieldId: null,
  devPriorityFieldId: null,
  statusFlow: {
    preWorkStatuses: [],
    reworkStatuses: [],
    readyToTestPath: [],
    developerStatuses: [],
  },
  suggestions: null,
}

const openApps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

describe('board routes', () => {
  it('board check without Jira returns 409', async () => {
    const dataDir = newDataDir()
    await saveBoard(dataDir, boardWith({ new: { 'MDP-1': makeTicket('MDP-1') } }))
    const { app } = await buildTestApp({ dataDir })
    openApps.push(app)

    const check = await app.inject({
      method: 'POST',
      url: '/api/board/check',
      headers: LOOPBACK_HEADERS,
    })
    const add = await app.inject({
      method: 'POST',
      url: '/api/board/add',
      headers: LOOPBACK_HEADERS,
      payload: { input: 'MDP-2' },
    })
    const board = await app.inject({ url: '/api/board', headers: LOOPBACK_HEADERS })

    expect(check.statusCode).toBe(409)
    expect(check.json()).toEqual({ ok: false, error: { code: 'notConnected' } })
    expect(add.statusCode).toBe(409)
    expect(board.json()).toMatchObject({
      connected: false,
      lastPoll: null,
      rows: [{ ticket: { key: 'MDP-1' }, section: 'new', url: '' }],
    })
  })

  it('add and the row actions work through HTTP; an unknown action is 404', async () => {
    const testApp = await buildTestApp()
    openApps.push(testApp.app)
    await testApp.services.settings.update({ jira: JIRA, jiraApiToken: 'token' })
    testApp.tracker.live.set('MDP-1', makeTicket('MDP-1'))
    const post = (
      url: string,
      payload?: Record<string, unknown>,
    ): Promise<LightMyRequestResponse> =>
      testApp.app.inject({
        method: 'POST',
        url,
        headers: LOOPBACK_HEADERS,
        ...(payload === undefined ? {} : { payload }),
      })

    const add = await post('/api/board/add', { input: '1' })
    const done = await post('/api/board/MDP-1/done')
    const unknownAction = await post('/api/board/MDP-1/explode')

    expect(add.json()).toEqual({ ok: true })
    expect(done.statusCode).toBe(200)
    expect(done.json()).toMatchObject({ rows: [{ ticket: { key: 'MDP-1' }, section: 'done' }] })
    expect(unknownAction.statusCode).toBe(404)
  })
})

describe('ticket update routes', () => {
  const viewed = {
    summary: 'Old',
    description: '',
    attachments: '',
    dueDate: null,
    eta: null,
    devPriority: null,
  }
  const current = { ...viewed, summary: 'New' }

  it('the viewed route marks the shown content and the update then reads as null', async () => {
    const dataDir = newDataDir()
    await saveBoard(dataDir, boardWith({ new: { 'MDP-1': makeTicket('MDP-1') } }))
    await writeJsonAtomic(join(dataDir, 'ticket-updates.json'), {
      'MDP-1': {
        viewed,
        current,
        updated: 'u',
        changedBy: 'An',
        changedAt: '2026-11-16T03:00:00.000Z',
      },
    })
    const { app } = await buildTestApp({ dataDir })
    openApps.push(app)
    const request = { headers: LOOPBACK_HEADERS }

    const before = await app.inject({ url: '/api/tickets/MDP-1/update', ...request })
    const marked = await app.inject({
      method: 'POST',
      url: '/api/tickets/MDP-1/update/viewed',
      payload: { shown: current },
      ...request,
    })
    const after = await app.inject({ url: '/api/tickets/MDP-1/update', ...request })

    expect(before.json()).toEqual({
      update: {
        fields: ['summary'],
        viewed,
        current,
        changedBy: 'An',
        changedAt: '2026-11-16T03:00:00.000Z',
      },
    })
    expect(marked.json()).toEqual({ ok: true })
    expect(after.json()).toEqual({ update: null })
  })

  it('a bad key or body is 400', async () => {
    const { app } = await buildTestApp()
    openApps.push(app)
    const post = (url: string, payload: unknown): Promise<LightMyRequestResponse> =>
      app.inject({ method: 'POST', url, headers: LOOPBACK_HEADERS, payload: payload as object })

    const badKey = await post('/api/tickets/nope/update/viewed', { shown: viewed })
    const badBody = await post('/api/tickets/MDP-1/update/viewed', { shown: { summary: 1 } })
    const badGet = await app.inject({ url: '/api/tickets/nope/update', headers: LOOPBACK_HEADERS })

    expect([badKey.statusCode, badBody.statusCode, badGet.statusCode]).toEqual([400, 400, 400])
  })
})
