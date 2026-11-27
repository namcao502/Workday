import { FaceSmile, ListCheck, PlugConnection } from '@gravity-ui/icons'
import { Button, SearchField, Spinner } from '@heroui/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { parseTicketKey, type BoardAction, type BoardView } from '@workday/core'
import { useEffect, useState } from 'react'
import { addTicket, boardAction, checkBoard, getBoard, queryKeys } from '../api/client.js'
import { useAccess } from '../api/useMe.js'
import { useSettings } from '../api/useSettings.js'
import { useNow } from '../api/useTimesheet.js'
import { useRepoLabels, useWork } from '../api/useWork.js'
import { useWorkspace } from '../api/useWorkspace.js'
import { errorText } from '../errors.js'
import { formatClock, t, type Language } from '../i18n.js'
import { navigateToSettings } from '../settings/settingsNav.js'
import { useNarrow } from '../shell/useNarrow.js'
import { ConfirmDialog } from '../ui/ConfirmDialog.js'
import { Page } from '../ui/Page.js'
import { Segmented } from '../ui/Segmented.js'
import { BoardCards } from './BoardCard.js'
import { BoardTable, type RowWork } from './BoardTable.js'
import type { RowWorkspace } from './RowMenu.js'
import { SuggestionsCard } from './SuggestionsCard.js'
import { TodoSection } from './TodoSection.js'
import { TodoView } from './TodoView.js'
import { useReadyToTest } from './useReadyToTest.js'
import { useAvailableDot } from './useAvailableDot.js'
import { useTicketLauncher } from './useTicketLauncher.js'
import {
  countViews,
  filterGroups,
  filterSuggestions,
  isPollLate,
  pickViewWithHits,
  rowsForView,
  VIEW_IDS,
  type BoardViewId,
} from './boardView.js'
import { SkeletonRows } from '../ui/Skeleton.js'
import { EmptyState } from '../ui/EmptyState.js'

const SEARCH_DEBOUNCE_MS = 200

function viewLabel(view: BoardViewId, count: number): string {
  switch (view) {
    case 'working':
      return t('board.working', { count: String(count) })
    case 'available':
      return t('board.available', { count: String(count) })
    case 'done':
      return t('board.done', { count: String(count) })
    case 'dismissed':
      return t('board.dismissed', { count: String(count) })
  }
}

function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value)
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [value])
  return debounced
}

interface PollStatusProps {
  readonly board: BoardView
  readonly language: Language
  readonly timeZone: string
  readonly pollMinutes: number | null // null until the settings load
}

function PollStatus({
  board,
  language,
  timeZone,
  pollMinutes,
}: PollStatusProps): React.JSX.Element | null {
  const now = useNow()
  const { lastPoll } = board
  if (lastPoll === null) {
    return null
  }
  if (!lastPoll.ok) {
    const text = errorText(lastPoll.error ?? { code: 'pollFailed' })
    return <span className="truncate whitespace-nowrap text-sm text-danger">{text}</span>
  }
  const clock = formatClock(new Date(lastPoll.at), language, timeZone)
  return (
    <span
      className={
        pollMinutes !== null && isPollLate(lastPoll.at, pollMinutes, now)
          ? 'truncate whitespace-nowrap text-sm text-warning'
          : 'truncate whitespace-nowrap text-sm text-muted'
      }
    >
      {t('board.checkedAt', { clock })}
    </span>
  )
}

export function BoardPage(): React.JSX.Element {
  const narrow = useNarrow()
  const queryClient = useQueryClient()
  const settings = useSettings()
  const access = useAccess()
  const canAct = access.canAct('board')
  const workspace = useWorkspace().data
  const launcher = useTicketLauncher()
  const work = useWork().data
  const repoLabels = useRepoLabels()
  const readyToTest = useReadyToTest()
  const board = useQuery({ queryKey: queryKeys.board, queryFn: getBoard })
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [view, setView] = useState<BoardViewId>('working')
  const [pickedForSearch, setPickedForSearch] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  const showBoard = (updated: BoardView): void => {
    queryClient.setQueryData(queryKeys.board, updated)
  }
  const check = useMutation({ mutationFn: checkBoard, onSuccess: showBoard })
  const act = useMutation({
    mutationFn: (request: { key: string; action: BoardAction }) =>
      boardAction(request.key, request.action),
    onSuccess: showBoard,
  })

  const language = settings.data?.config.language ?? 'en'
  const timeZone = settings.data?.config.timeZone ?? 'UTC'
  const projectKey = settings.data?.config.jira?.projectKey
  const rows = board.data?.rows ?? []
  const todoGroups = filterGroups(work?.groups ?? [], rows, debouncedSearch)
  const suggestions = work?.suggestions ?? null
  const availableItems =
    suggestions === null ? [] : filterSuggestions(suggestions.items, debouncedSearch)
  const counts = {
    ...countViews(rows, debouncedSearch),
    available: availableItems.length,
  }
  // No suggestions config: no Available view at all.
  const viewIds = suggestions === null ? VIEW_IDS.filter((id) => id !== 'available') : VIEW_IDS
  const shownView = viewIds.includes(view) ? view : 'working'
  const searching = debouncedSearch.trim() !== ''
  const activeView =
    searching && pickedForSearch !== debouncedSearch
      ? pickViewWithHits(counts, shownView)
      : shownView
  const availableDot = useAvailableDot(
    (suggestions?.items ?? []).filter((item) => item.urgent).map((item) => item.ticket.key),
    activeView === 'available',
  )

  const typedKey = projectKey === undefined ? null : parseTicketKey(search, projectKey)
  const addableKey =
    typedKey !== null && !rows.some((row) => row.ticket.key === typedKey) ? typedKey : null

  async function addTypedTicket(): Promise<void> {
    if (addableKey === null || !canAct) {
      return
    }
    try {
      const result = await addTicket(search)
      if (result.ok) {
        setSearch('')
        await queryClient.invalidateQueries({ queryKey: queryKeys.board })
      } else {
        setAddError(errorText(result.error))
      }
    } catch {
      setAddError(errorText({ code: 'jiraUnreachable' }))
    }
  }

  const rowWorkspace: RowWorkspace | undefined =
    workspace?.configured === true
      ? {
          openKeys: new Set(workspace.tabs.map((tab) => tab.id)),
          starting: new Set(workspace.starting),
          onStart: launcher.start,
          onOpen: launcher.open,
        }
      : undefined

  const rowWork: RowWork | undefined =
    work === undefined
      ? undefined
      : {
          prs: work.prs,
          repoLabels,
          readyToTest: work.readyToTest,
          onReadyToTest: readyToTest.ask,
        }

  const listProps = {
    workspace: rowWorkspace,
    work: rowWork,
    rows: activeView === 'available' ? [] : rowsForView(rows, activeView, debouncedSearch),
    view: activeView === 'available' ? 'working' : activeView,
    language,
    onAction: (key: string, action: BoardAction) => {
      act.mutate({ key, action })
    },
  }

  // Top bar, left to right: view switch, search (and the Add it offers), Check now, then the poll status.
  // Wraps on a phone, where it sits under the top bar (phoneActionsBelow): the search then takes a line.
  const headerControls = (
    <div className="flex min-w-0 items-center gap-2 max-[719px]:flex-wrap">
      {/* min-w-0 lets the switch shrink and scroll sideways before it pushes the search off the bar. */}
      <div className="flex min-w-0">
        <Segmented
          label={t('board.boardView')}
          value={activeView}
          options={viewIds.map((id) => ({
            value: id,
            label: viewLabel(id, counts[id]),
            dot: id === 'available' && availableDot,
          }))}
          onChange={(picked) => {
            setView(picked)
            setPickedForSearch(debouncedSearch)
          }}
        />
      </div>
      <SearchField
        variant="secondary"
        className="w-56 shrink-0 max-[719px]:w-full max-[719px]:shrink"
        aria-label={canAct ? t('board.searchOrAddATicket') : t('board.searchTickets')}
        value={search}
        onChange={(value) => {
          setSearch(value)
          setAddError(null)
        }}
        onSubmit={() => {
          void addTypedTicket()
        }}
      >
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input
            placeholder={canAct ? t('board.searchOrAddATicket') : t('board.searchTickets')}
          />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>
      {addableKey === null || !canAct ? null : (
        <Button
          variant="primary"
          size="sm"
          className="shrink-0"
          onPress={() => {
            void addTypedTicket()
          }}
        >
          {t('board.add', { addableKey })}
        </Button>
      )}
      {canAct ? (
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0"
          isDisabled={check.isPending}
          onPress={() => {
            check.mutate()
          }}
        >
          {check.isPending ? <Spinner size="sm" /> : null}
          {t('board.checkNow')}
        </Button>
      ) : null}
      {board.data === undefined ? null : (
        <PollStatus
          board={board.data}
          language={language}
          timeZone={timeZone}
          pollMinutes={settings.data?.config.pollMinutes ?? null}
        />
      )}
    </div>
  )

  return (
    <Page title={t('board.tickets')} wide phoneActionsBelow actions={headerControls}>
      {check.isError ? (
        <p className="text-sm text-danger">{errorText({ code: 'pollFailed' })}</p>
      ) : null}
      {addError === null ? null : <p className="text-sm text-danger">{addError}</p>}
      {launcher.error === null ? null : <p className="text-sm text-danger">{launcher.error}</p>}
      {launcher.recreateKey === null ? null : (
        <ConfirmDialog
          message={t('board.recreateTheWorktree', { recreateKey: launcher.recreateKey })}
          confirmLabel={t('board.recreate')}
          onConfirm={launcher.confirmRecreate}
          onCancel={launcher.cancelRecreate}
        />
      )}
      {readyToTest.dialog}
      {readyToTest.message === null ? null : (
        <p className="text-sm text-muted" role="status">
          {readyToTest.message}
        </p>
      )}
      {board.data?.connected === true ? (
        <TodoSection count={todoGroups.length}>
          <TodoView
            groups={todoGroups}
            rows={rows}
            language={language}
            workspace={rowWorkspace}
            onDone={(key) => {
              act.mutate({ key, action: 'done' })
            }}
            onReadyToTest={readyToTest.ask}
          />
        </TodoSection>
      ) : null}
      {board.data === undefined ? (
        <SkeletonRows label={t('board.loading')} rows={4} className="[&>div:not(.sr-only)]:h-16" />
      ) : !board.data.connected ? (
        <EmptyState
          icon={<PlugConnection aria-hidden="true" />}
          message={t('board.jiraIsNotConnectedOpenSettings')}
          action={{
            label: t('board.openSettings'),
            onPress: () => {
              navigateToSettings('jira')
            },
          }}
        />
      ) : activeView === 'available' && suggestions !== null ? (
        availableItems.length === 0 ? (
          <EmptyState icon={<FaceSmile aria-hidden="true" />} message={t('board.nothingToTake')} />
        ) : (
          <SuggestionsCard
            suggestions={{ ...suggestions, items: availableItems }}
            today={board.data.today}
            language={language}
          />
        )
      ) : listProps.rows.length === 0 ? (
        <EmptyState icon={<ListCheck aria-hidden="true" />} message={t('board.noTickets')} />
      ) : narrow ? (
        <BoardCards {...listProps} />
      ) : (
        <BoardTable {...listProps} />
      )}
    </Page>
  )
}
