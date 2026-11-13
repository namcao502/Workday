import { afterEach, describe, expect, it } from 'vitest'
import type { JiraConfig } from '@workday/core'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { saveBoard } from '../boardStore.js'
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
  statusFlow: { preWorkStatuses: [], reworkStatuses: [], readyToTestPath: [], developerStatuses: [] },
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
