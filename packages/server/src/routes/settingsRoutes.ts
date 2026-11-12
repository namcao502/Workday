import type { FastifyInstance } from 'fastify'
import {
  parseHrmCheckRequest,
  parseJiraCheckRequest,
  parseSettingsUpdate,
} from '../settings/parseSettings.js'
import type { SettingsService } from '../settings/settingsService.js'

const TOKEN_REQUIRED = {
  error: 'jiraApiToken is required for a Jira base URL without a saved token',
}
const SECRET_REQUIRED = {
  error: 'jiraApiToken or hrmApiKey is required for a host without a saved one',
}
const HRM_KEY_REQUIRED = {
  error: 'hrmApiKey is required for an MCP URL without a saved key',
}

export function registerSettingsRoutes(app: FastifyInstance, settings: SettingsService): void {
  app.get('/api/settings', () => settings.view())

  app.put('/api/settings', async (request, reply) => {
    const update = parseSettingsUpdate(request.body)
    if (update === null) {
      return reply.code(400).send({ error: 'Invalid settings' })
    }
    const outcome = await settings.update(update)
    if (!outcome.ok) {
      return reply.code(400).send(SECRET_REQUIRED)
    }
    return outcome.view
  })

  app.post('/api/settings/jira/check', async (request, reply) => {
    const checkRequest = parseJiraCheckRequest(request.body)
    if (checkRequest === null) {
      return reply.code(400).send({ error: 'Body must be { baseUrl, email, jiraApiToken? }' })
    }
    const result = await settings.checkJira(checkRequest)
    if (result === 'tokenRequired') {
      return reply.code(400).send(TOKEN_REQUIRED)
    }
    return result
  })

  app.post('/api/settings/hrm/check', async (request, reply) => {
    const checkRequest = parseHrmCheckRequest(request.body)
    if (checkRequest === null) {
      return reply.code(400).send({ error: 'Body must be { mcpUrl, hrmApiKey? }' })
    }
    const result = await settings.checkHrm(checkRequest)
    if (result === 'tokenRequired') {
      return reply.code(400).send(HRM_KEY_REQUIRED)
    }
    return result
  })

  app.post('/api/settings/tsc/session', () => settings.checkTscSession())

  app.post('/api/settings/tsc/sign-in', () => settings.signInTsc())
}
