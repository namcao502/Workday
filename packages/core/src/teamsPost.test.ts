import { describe, expect, it } from 'vitest'
import type { TicketPr, TrackedPr } from './prTracking.js'
import {
  buildPostDraft,
  postedKey,
  resolvePostLead,
  sectionHeader,
  splitSubject,
  withGreeting,
} from './teamsPost.js'

const DA = 'd' + String.fromCharCode(0x1ea1)
const TEMPLATE = `a {lead}, ${DA} `
const LEAD = { mri: '8:orgid:lead', displayName: 'Minh Dinh (DU2 - Tech Leader)' }
const LABELS = {
  'Backend-DotNet': 'BE',
  'ExternalPortal-Angular': 'FE External',
  'Portal-Angular': 'FE Portal',
}

function ticketPr(
  repository: string,
  branch: string,
  id: number,
  status: TrackedPr['status'],
): TicketPr {
  return {
    key: `MDP-1|${branch}|${String(id)}`,
    branch,
    pullRequestId: id,
    pr: {
      status,
      repository,
      url: `https://dev.azure.com/${repository}/pr/${String(id)}`,
      commentCount: 0,
      openThreadCount: null,
      build: null,
      merge: null,
      vote: null,
      mergeCommit: null,
      mergedAt: null,
      targetBranch: null,
    },
  }
}

describe('buildPostDraft', () => {
  it('lists BE then FE blocks by the configured labels', () => {
    const backendMain = ticketPr('Backend-DotNet', 'main', 1, 'active')
    const backendDev = ticketPr('Backend-DotNet', 'dev', 2, 'completed')
    const externalMain = ticketPr('ExternalPortal-Angular', 'main', 3, 'active')
    const abandoned = ticketPr('Portal-Angular', 'main', 4, 'abandoned')

    const post = buildPostDraft(
      { key: 'MDP-1', summary: 'Summary' },
      [backendMain, backendDev, externalMain, abandoned],
      LABELS,
    )

    expect(post).toBe(
      `MDP-1 Summary\n\n\n\n[BE]\nmain: ${backendMain.pr.url}\ndev: ${backendDev.pr.url}\n\n[FE External]\nmain: ${externalMain.pr.url}`,
    )
    expect(post).not.toContain(abandoned.pr.url)
  })

  it('keeps the description line when there is no PR and no summary', () => {
    expect(buildPostDraft({ key: 'MDP-1', summary: ' ' }, [], LABELS)).toBe('MDP-1\n\n')
  })

  it('names a repository without a label by its own name', () => {
    expect(sectionHeader(ticketPr('Other', 'main', 1, 'active'), LABELS)).toBe('[Other]')
    expect(sectionHeader(ticketPr('Portal-Angular', 'main', 1, 'active'), LABELS)).toBe(
      '[FE Portal]',
    )
  })
})

describe('postedKey', () => {
  it('is the ticket key', () => {
    expect(postedKey('MDP-1')).toBe('MDP-1')
  })
})

describe('splitSubject', () => {
  it('takes the first line and trims the body', () => {
    expect(splitSubject('  MDP-1 Summary \r\n\r\nm\r\n[BE]\r\nmain: x\r\n')).toEqual({
      subject: 'MDP-1 Summary',
      body: 'm\n[BE]\nmain: x',
    })
  })

  it('has an empty body when only the title is written', () => {
    expect(splitSubject('MDP-1 x\r\n\r\n ')).toEqual({ subject: 'MDP-1 x', body: '' })
  })
})

describe('withGreeting', () => {
  const greeting = `a Minh Dinh (DU2 - Tech Leader), ${DA} `

  it('prefixes the description and lowercases its first letter', () => {
    expect(withGreeting('MDP-1 x\n\nE update A\n\n[BE]\nmain: u', LEAD, TEMPLATE)).toBe(
      `MDP-1 x\n\n${greeting}e update A\n\n[BE]\nmain: u`,
    )
  })

  it('keeps an acronym as written', () => {
    expect(withGreeting('MDP-1 x\n\nAPI fails', LEAD, TEMPLATE)).toBe(
      `MDP-1 x\n\n${greeting}API fails`,
    )
  })

  it('adds a line before a code fence or a PR block when there is no description', () => {
    expect(withGreeting('MDP-1: x\n\n```sql\nX;\n```', null, TEMPLATE)).toBe(
      `MDP-1: x\n\n${DA} e update \n\n\`\`\`sql\nX;\n\`\`\``,
    )
    expect(withGreeting('MDP-1\r\n\r\n', null, TEMPLATE)).toBe(`MDP-1\r\n\r\n${DA} e update `)
  })

  it.each(['a Minh, e update', 'D' + DA.slice(1) + ' e update', `${DA}, e update`])(
    'leaves a description that already greets: %s',
    (description) => {
      const draft = `MDP-1 x\n\n${description}\n\n[BE]\nmain: u`
      expect(withGreeting(draft, LEAD, TEMPLATE)).toBe(draft)
    },
  )

  it('still greets when the first word only starts with a', () => {
    expect(withGreeting('MDP-1 x\n\nabc', null, TEMPLATE)).toBe(`MDP-1 x\n\n${DA} abc`)
  })

  it('leaves the body alone without a template', () => {
    expect(withGreeting('MDP-1 x\n\nabc', LEAD, null)).toBe('MDP-1 x\n\nabc')
  })
})

describe('resolvePostLead', () => {
  it('finds the first known person whose name starts with the configured one, ignoring case', () => {
    const minh = { mri: '8:minh', displayName: 'minh dinh (DU2)' }
    const known = [
      { mri: '8:other', displayName: 'Ann' },
      minh,
      { mri: '8:minh2', displayName: 'Minh Dinh 2' },
    ]

    expect(resolvePostLead(known, 'Minh Dinh')).toBe(minh)
    expect(resolvePostLead(known, 'Zed')).toBeNull()
    expect(resolvePostLead(known, null)).toBeNull()
    expect(resolvePostLead(known, ' ')).toBeNull()
  })
})
