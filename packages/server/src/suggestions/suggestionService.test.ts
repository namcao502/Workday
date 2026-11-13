import type { BoardState, EpicTicket, SuggestionsConfig } from '@workday/core'
import { describe, expect, it, vi } from 'vitest'
import type { NoticeInput } from '../notices/noticeService.js'
import { boardWith, FakeTracker, makeTicket } from '../testing/fakes.js'
import { EMPTY_SUGGESTION_STATE } from './suggestionStore.js'
import { SuggestionService, type SuggestionState } from './suggestionService.js'

const CONFIG: SuggestionsConfig = {
  epicJql: 'epics',
  epicTitlePrefix: 'MDP Issues - ',
  candidatesJql: 'cand {epic}',
  mineJql: 'mine {epic}',
  selectedStatus: null,
}

function epicTicket(key: string, overrides: Partial<EpicTicket> = {}): EpicTicket {
  return {
    key,
    summary: `Work of ${key}`,
    status: 'To Do',
    issueType: 'Task',
    priority: null,
    devPriority: null,
    dueDate: null,
    ...overrides,
  }
}

const EPIC = epicTicket('MDP-1', { summary: 'MDP Issues - November 2026' })

// Answers each JQL from `results`; a failing tracker rejects every search.
class EpicTracker extends FakeTracker {
  results: Record<string, readonly EpicTicket[]> = {}
  failing = false

  override searchEpicTickets(jql: string): Promise<readonly EpicTicket[]> {
    super.searchEpicTickets(jql).catch(() => undefined)
    if (this.failing) {
      return Promise.reject(new Error('Jira search failed'))
    }
    return Promise.resolve(this.results[jql] ?? [])
  }
}

function setup(initialState: SuggestionState = EMPTY_SUGGESTION_STATE, board: BoardState = boardWith()) {
  const tracker = new EpicTracker()
  tracker.results = { epics: [EPIC] }
  const notices: NoticeInput[] = []
  const events: unknown[] = []
  const poll = vi.fn(() => Promise.resolve())
  const service = new SuggestionService({
    initialState,
    save: () => Promise.resolve(),
    events: { broadcast: (event) => events.push(event) },
    notices: {
      add: (input) => {
        notices.push(input)
        return Promise.resolve()
      },
    },
    board: { snapshot: () => board, poll },
    settings: { tracker, config: CONFIG, projectKey: 'MDP', timeZone: 'Asia/Ho_Chi_Minh' },
    now: () => new Date('2026-11-13T05:00:00Z'),
    logError: () => undefined,
  })
  return { service, tracker, notices, events, poll }
}

function keysOf(service: SuggestionService): readonly string[] {
  return (service.view()?.items ?? []).map((item) => item.ticket.key)
}

describe('SuggestionService', () => {
  it("refresh ranks this month's epic candidates without board keys or hidden keys", async () => {
    const board = boardWith({ new: { 'MDP-12': makeTicket('MDP-12') } })
    const state = { ...EMPTY_SUGGESTION_STATE, hiddenKeys: ['MDP-11', 'MDP-99'] }
    const { service, tracker } = setup(state, board)
    tracker.results['cand MDP-1'] = ['MDP-10', 'MDP-11', 'MDP-12'].map((key) => epicTicket(key))

    await service.refresh()

    expect(service.view()).toMatchObject({ epicKey: 'MDP-1' })
    expect(keysOf(service)).toEqual(['MDP-10'])
    expect(tracker.epicSearches).toEqual(['epics', 'cand MDP-1', 'mine MDP-1'])
    await service.refresh()
    expect(tracker.epicSearches).toHaveLength(5) // the epic is kept for the month
  })

  it('refresh keeps the last items when Jira fails', async () => {
    const { service, tracker } = setup()
    tracker.results['cand MDP-1'] = [epicTicket('MDP-10')]
    await service.refresh()

    tracker.failing = true
    await service.refresh()

    expect(keysOf(service)).toEqual(['MDP-10'])
  })

  it('refresh notices new urgent suggestions once a day', async () => {
    const { service, tracker, notices } = setup()
    const urgent = (key: string): EpicTicket => epicTicket(key, { priority: 'High' })
    tracker.results['cand MDP-1'] = [urgent('MDP-10')]
    await service.refresh()
    tracker.results['cand MDP-1'] = [urgent('MDP-10'), urgent('MDP-13')]
    await service.refresh()
    tracker.results['cand MDP-1'] = [urgent('MDP-10'), urgent('MDP-13'), urgent('MDP-14')]
    await service.refresh()

    expect(notices).toEqual([
      {
        topic: 'suggestions',
        tone: 'info',
        event: { type: 'suggestionsUrgent', keys: ['MDP-13'] },
        target: { kind: 'board', key: null },
        place: 'board',
      },
    ])
  })

  it('take reports the holder and drops the suggestion', async () => {
    const { service, tracker, poll } = setup()
    tracker.results['cand MDP-1'] = [epicTicket('MDP-10'), epicTicket('MDP-11')]
    tracker.assignResult = 'Alex'
    await service.refresh()

    const outcome = await service.take('MDP-10')

    expect(outcome).toEqual({ ok: false, holder: 'Alex' })
    expect(keysOf(service)).toEqual(['MDP-11'])
    expect(poll).not.toHaveBeenCalled()
  })

  it('take assigns, drops the suggestion and polls the board', async () => {
    const { service, tracker, poll } = setup()
    tracker.results['cand MDP-1'] = [epicTicket('MDP-10'), epicTicket('MDP-11')]
    await service.refresh()

    const outcome = await service.take('MDP-10')

    expect(outcome).toEqual({ ok: true })
    expect(tracker.assignCalls).toEqual(['MDP-10'])
    expect(keysOf(service)).toEqual(['MDP-11'])
    expect(poll).toHaveBeenCalledTimes(1)
  })
})
