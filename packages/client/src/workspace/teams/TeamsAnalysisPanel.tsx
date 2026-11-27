import { ChevronDown } from '@gravity-ui/icons'
import { Button, Input } from '@heroui/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { TeamsAnalysis, TeamsAnalysisView, TeamsIssueStatus } from '@workday/core'
import { useEffect, useRef, useState } from 'react'
import { analysisKey, getAnalysis, startAnalysis } from '../../api/teamsApi.js'
import { errorText } from '../../errors.js'
import { t } from '../../i18n.js'

const POLL_MS = 3_000
const OPEN_STORAGE_PREFIX = 'workday.teamsAnalysisOpen.'

// Collapsed by default, so the thread keeps the height; a ticket remembers being opened.
function readOpen(ticket: string): boolean {
  return localStorage.getItem(OPEN_STORAGE_PREFIX + ticket) === '1'
}

function writeOpen(ticket: string, open: boolean): void {
  if (open) {
    localStorage.setItem(OPEN_STORAGE_PREFIX + ticket, '1')
  } else {
    localStorage.removeItem(OPEN_STORAGE_PREFIX + ticket)
  }
}

const STATUS_DOT: Readonly<Record<TeamsIssueStatus, string>> = {
  open: 'bg-danger',
  answered: 'bg-warning',
  fixed: 'bg-success',
}

const STATUS_TEXT: Readonly<Record<TeamsIssueStatus, string>> = {
  open: 'text-danger',
  answered: 'text-warning',
  fixed: 'text-success',
}

function statusLabel(status: TeamsIssueStatus): string {
  if (status === 'fixed') {
    return t('teams.fixed')
  }
  return status === 'answered' ? t('teams.answered') : t('teams.open')
}

function summaryOf(analysis: TeamsAnalysis): string {
  const total = analysis.issues.length
  if (total === 0) {
    return t('teams.claudeSAnalysis')
  }
  const open = analysis.issues.filter((issue) => issue.status === 'open').length
  return t('teams.claudeIssueSOpen', { total: String(total), open: String(open) })
}

function Section({
  title,
  children,
}: {
  readonly title: string
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm font-semibold">{title}</span>
      {children}
    </div>
  )
}

function AnalysisBody({ analysis }: { readonly analysis: TeamsAnalysis }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 pt-2 text-sm">
      {analysis.issues.length === 0 ? null : (
        <Section title={t('teams.problemsRaised')}>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {analysis.issues.map((issue, index) => (
              <li key={`${String(index)}-${issue.text}`} className="flex items-start gap-2">
                <span
                  className={`mt-1.5 size-2 flex-none rounded-full ${STATUS_DOT[issue.status]}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">{issue.text}</span>
                <span className={`text-xs ${STATUS_TEXT[issue.status]}`}>
                  {statusLabel(issue.status)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {analysis.diagnosis === '' ? null : (
        <Section title={t('teams.diagnosis')}>
          <p className="m-0">{analysis.diagnosis}</p>
        </Section>
      )}
      {analysis.nextStep === '' ? null : (
        <Section title={t('teams.nextStep')}>
          <p className="m-0">{analysis.nextStep}</p>
        </Section>
      )}
    </div>
  )
}

interface PanelProps {
  readonly ticket: string
  readonly conversationId: string
  readonly lastMessageId: string
  readonly session: string // Claude's session of the ticket
  readonly waitingLine: string | null // "Name is waiting since 3:05 PM", when the last message is not mine
  readonly onUseReply: (text: string) => void
}

// Port of the WPF analysis box: Analyze (with an optional main point), Claude's summary of the thread
// and the replies it suggests; picking a reply only loads it into the composer.
export function TeamsAnalysisPanel({
  ticket,
  conversationId,
  lastMessageId,
  session,
  waitingLine,
  onUseReply,
}: PanelProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [mainPoint, setMainPoint] = useState('')
  const [open, setOpen] = useState(() => readOpen(ticket))
  const [problem, setProblem] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const key = analysisKey(ticket, conversationId)
  const { data } = useQuery<TeamsAnalysisView>({
    queryKey: [...key, lastMessageId],
    queryFn: () => getAnalysis(ticket, conversationId, lastMessageId, session),
    refetchInterval: (query) => (query.state.data?.kind === 'running' ? POLL_MS : false),
  })
  const view: TeamsAnalysisView = data ?? { kind: 'none' }
  const running = view.kind === 'running' || starting

  // An analysis seen running here opens once it is done, so a fresh result is not missed.
  const sawRunning = useRef(false)
  useEffect(() => {
    if (view.kind === 'running') {
      sawRunning.current = true
    } else if (view.kind === 'done' && sawRunning.current) {
      sawRunning.current = false
      setOpen(true)
    }
  }, [view.kind])

  async function analyze(): Promise<void> {
    if (running) {
      return
    }
    setStarting(true)
    setProblem(null)
    try {
      const result = await startAnalysis(ticket, {
        conversationId,
        mainPoint: mainPoint.trim() === '' ? null : mainPoint.trim(),
        session,
      })
      if (!result.ok) {
        setProblem(errorText(result.error))
      }
      await queryClient.invalidateQueries({ queryKey: key })
    } catch {
      setProblem(t('teams.couldNotReachTheWorkdayServer'))
    } finally {
      setStarting(false)
    }
  }

  let summary: string | null = null
  if (running) {
    summary = t('teams.claudeIsAnalyzingInTheSession')
  } else if (view.kind === 'failed') {
    summary = t('teams.claudeStoppedWithoutAnAnalysisThe')
  } else if (view.kind === 'done') {
    summary = summaryOf(view.analysis)
  }
  const stale =
    view.kind === 'done' && view.stale ? t('teams.newMessagesSinceThisAnalysisPress') : null
  const parts = [summary, stale, waitingLine].filter((part) => part !== null)
  const done = view.kind === 'done' ? view.analysis : null
  const hint = t('teams.mainPointOfTheReplyOptional')

  return (
    <div className="flex min-h-0 flex-col gap-2 py-1" data-testid="teams-analysis">
      {parts.length === 0 ? null : (
        <div className="flex min-h-0 flex-col rounded-2xl bg-surface-secondary p-3">
          {done === null ? (
            <p
              className={`m-0 min-w-0 text-sm ${view.kind === 'failed' ? 'text-danger' : ''}`}
              role="status"
            >
              {parts.join('  -  ')}
            </p>
          ) : (
            // The whole line folds and opens; the chevron only shows that it can.
            <button
              type="button"
              aria-expanded={open}
              className="press-flat flex w-full cursor-pointer items-center gap-2 text-left"
              onClick={() => {
                writeOpen(ticket, !open)
                setOpen(!open)
              }}
            >
              <span
                className={`min-w-0 flex-1 text-sm ${view.kind === 'failed' ? 'text-danger' : ''}`}
                role="status"
              >
                {parts.join('  -  ')}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={`pointer-events-none flex-none transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </button>
          )}
          {done !== null && open ? (
            // At most a third of the screen, and less when the pane is short: the details scroll here, so
            // neither the thread nor the whole pane has to.
            <div
              className="max-h-[33vh] min-h-24 shrink overflow-y-auto pr-1"
              data-testid="teams-analysis-details"
            >
              <AnalysisBody analysis={done} />
              <div
                className="flex flex-col gap-1 pt-2"
                role="group"
                aria-label={t('teams.suggestedReplies')}
              >
                {done.replies.map((reply, index) => (
                  <Button
                    key={`${String(index)}-${reply}`}
                    variant="secondary"
                    size="sm"
                    className="h-auto justify-start whitespace-normal bg-surface py-1.5 text-left"
                    onPress={() => {
                      onUseReply(reply)
                    }}
                  >
                    {reply}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
      {/* Result first, then the action that refreshes it. */}
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" isDisabled={running} onPress={() => void analyze()}>
          {view.kind === 'done' || waitingLine !== null
            ? t('teams.analyzeAgain')
            : t('teams.analyze')}
        </Button>
        <Input
          variant="secondary"
          className="min-w-0 flex-1"
          aria-label={hint}
          placeholder={hint}
          value={mainPoint}
          onChange={(event) => {
            setMainPoint(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void analyze()
            }
          }}
        />
      </div>
      {problem === null ? null : (
        <p className="m-0 text-sm text-danger" role="alert">
          {problem}
        </p>
      )}
    </div>
  )
}
