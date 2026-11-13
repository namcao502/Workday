import type { RemoteConfig, WorkdayConfig } from '@workday/core'
import { expect } from 'vitest'
import { DEFAULT_WORKSPACE, saveConfig } from '../config.js'
import {
  buildTestApp,
  LOOPBACK_HEADERS,
  newDataDir,
  TEST_PORT,
  VALID_ACCESS_JWT,
  type TestApp,
} from './testApp.js'

export const PUBLIC_HOST = 'workday.example.com'
export const PUBLIC_ORIGIN = `https://${PUBLIC_HOST}`

export const ENABLED_REMOTE: RemoteConfig = {
  enabled: true,
  publicHost: PUBLIC_HOST,
  accessTeamDomain: 'team.cloudflareaccess.com',
  accessAud: 'aud-123',
  cloudflaredPath: null,
}

// What the tunnel forwards: the public Host, a Cloudflare ray id and a valid Access JWT.
export function remoteHeaders(deviceToken?: string): Record<string, string> {
  return {
    host: PUBLIC_HOST,
    'cf-ray': 'ray-1',
    'cf-connecting-ip': '203.0.113.7',
    'cf-access-jwt-assertion': VALID_ACCESS_JWT,
    origin: PUBLIC_ORIGIN,
    ...(deviceToken === undefined ? {} : { cookie: `wd_device=${deviceToken}` }),
  }
}

export async function buildRemoteApp(
  remote: RemoteConfig | null = ENABLED_REMOTE,
  options: { clientDist?: string } = {},
): Promise<TestApp> {
  const dataDir = newDataDir()
  const config: WorkdayConfig = {
    host: '127.0.0.1',
    port: TEST_PORT,
    timeZone: 'Asia/Ho_Chi_Minh',
    pollMinutes: 5,
    workspace: DEFAULT_WORKSPACE,
    theme: 'dark',
    language: 'en',
    jira: null,
    remote,
    timesheet: { logTime: '18:00', hrm: null, tsc: null },
  }
  await saveConfig(dataDir, config)
  return buildTestApp({ dataDir, ...options })
}

// Pairs a phone the way a user does; returns the device token from the Set-Cookie header.
export async function pairDevice(testApp: TestApp, name = 'iPhone'): Promise<string> {
  const { app } = testApp
  const opened = await app.inject({
    method: 'POST',
    url: '/api/remote/pairing',
    headers: LOOPBACK_HEADERS,
  })
  const { code } = opened.json<{ code: string }>()
  const submitted = await app.inject({
    method: 'POST',
    url: '/api/pair',
    headers: remoteHeaders(),
    payload: { code, name },
  })
  const { requestId } = submitted.json<{ requestId: string }>()
  await app.inject({
    method: 'POST',
    url: '/api/remote/pairing/approve',
    headers: LOOPBACK_HEADERS,
  })
  const status = await app.inject({
    url: `/api/pair/status?id=${requestId}`,
    headers: remoteHeaders(),
  })
  const cookie = String(status.headers['set-cookie'])
  const token = /^wd_device=([^;]+);/.exec(cookie)?.[1]
  expect(token).toBeDefined()
  return token ?? ''
}
