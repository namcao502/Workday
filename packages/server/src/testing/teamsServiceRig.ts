import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TeamsPostIndex } from '@workday/core'
import { TeamsService } from '../teams/teamsService.js'
import { EMPTY_TEAMS_STATE, type TeamsState } from '../teams/teamsStore.js'
import { FakeTeams, NOON } from './fakeTeams.js'
import { boardWith, makeTicket } from './fakes.js'

export interface ServiceRig {
  readonly teams: FakeTeams
  readonly service: TeamsService
  readonly clock: { now: Date }
  readonly saved: { index: TeamsPostIndex; state: TeamsState; fail: boolean }
  // The ticket's Claude: whether it is idle and warm, and the lines sent to it.
  readonly claude: { idle: boolean; prompts: string[] }
}

// Every channel id given is watched as "team > <id>", in that order.
export function serviceRig(
  channelIds: readonly string[],
  initialIndex: TeamsPostIndex = {},
  initialState: TeamsState = EMPTY_TEAMS_STATE,
): ServiceRig {
  const teams = new FakeTeams()
  channelIds.forEach((id) => {
    teams.addChannel(id)
  })
  const clock = { now: NOON }
  const saved = { index: initialIndex, state: initialState, fail: false }
  const claude = { idle: false, prompts: [] as string[] }
  const service = new TeamsService({
    initialIndex,
    saveIndex: (index) => {
      if (saved.fail) {
        return Promise.reject(new Error('disk full'))
      }
      saved.index = index
      return Promise.resolve()
    },
    initialState,
    saveState: (state) => {
      if (saved.fail) {
        return Promise.reject(new Error('disk full'))
      }
      saved.state = state
      return Promise.resolve()
    },
    now: () => clock.now,
    board: { snapshot: () => boardWith({ inProgress: { 'MDP-1': makeTicket('MDP-1') } }) },
    prs: { state: () => ({ tracking: {} }) },
    workspace: {
      promptState: () => 'sent',
      prompt: (_name, text) => {
        claude.prompts.push(text)
        return 'sent'
      },
      assistantTexts: () => [],
      isWorking: () => !claude.idle,
      isIdleAndWarm: () => claude.idle,
    },
    tmpDir: mkdtempSync(join(tmpdir(), 'teams-rig-')),
    log: () => undefined,
  })
  service.configure({
    chat: teams,
    config: {
      watchedChannels: channelIds.map((id) => `team > ${id}`),
      postLeadName: null,
      postGreeting: null,
      dbReviewChannel: null,
    },
    devRepoPath: null,
    repoLabels: {},
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  return { teams, service, clock, saved, claude }
}

// An own post in a fully scanned, just synced channel: a read needs no page.
export function indexedOwnPost(channelId: string, rootId: string): TeamsPostIndex {
  return {
    [channelId]: {
      syncedAt: NOON.toISOString(),
      deepScanned: true,
      deepScanPages: 0,
      deepScanLink: null,
      posts: { 'MDP-1': { rootId, sentAt: NOON.toISOString(), mine: true } },
    },
  }
}
