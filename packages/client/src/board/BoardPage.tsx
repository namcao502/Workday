import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { parseTicketKey, type BoardAction, type BoardView } from '@workday/core'
import { useEffect, useState } from 'react'
import { addTicket, boardAction, checkBoard, getBoard, queryKeys } from '../api/client.js'
import { useAccess } from '../api/useMe.js'
import { useSettings } from '../api/useSettings.js'
import { errorText } from '../errors.js'
import { formatClock, t, type Language } from '../i18n.js'
import { Segmented } from '../settings/Segmented.js'
import { navigateTo } from '../shell/pages.js'
import { useNarrow } from '../shell/useNarrow.js'
import './board.css'
import { BoardCards } from './BoardCard.js'
import { BoardTable } from './BoardTable.js'
import {
  countViews,
  pickViewWithHits,
  rowsForView,
  VIEW_IDS,
  type BoardViewId,
} from './boardView.js'

const SEARCH_DEBOUNCE_MS = 200

function viewLabel(view: BoardViewId, count: number): string {
  switch (view) {
    case 'working':
      return t(`Working (${String(count)})`, `Đang làm (${String(count)})`)
    case 'done':
      return t(`Done (${String(count)})`, `Xong (${String(count)})`)
    case 'dismissed':
      return t(`Dismissed (${String(count)})`, `Đã bỏ qua (${String(count)})`)
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
}

function PollStatus({ board, language, timeZone }: PollStatusProps): React.JSX.Element | null {
  const { lastPoll } = board
  if (lastPoll === null) {
    return null
  }
  if (!lastPoll.ok) {
    const text = errorText(lastPoll.error ?? { code: 'pollFailed' })
    return <span className="poll-status danger">{text}</span>
  }
  const clock = formatClock(new Date(lastPoll.at), language, timeZone)
  return (
    <span className="poll-status muted">
      {t(`Checked at ${clock}`, `Đã kiểm tra lúc ${clock}`)}
    </span>
  )
}

export function BoardPage(): React.JSX.Element {
  const narrow = useNarrow()
  const queryClient = useQueryClient()
  const settings = useSettings()
  const canAct = useAccess().canAct('board')
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
  const counts = countViews(rows, debouncedSearch)
  const searching = debouncedSearch.trim() !== ''
  const activeView =
    searching && pickedForSearch !== debouncedSearch ? pickViewWithHits(counts, view) : view

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

  const listProps = {
    rows: rowsForView(rows, activeView, debouncedSearch),
    view: activeView,
    language,
    onAction: (key: string, action: BoardAction) => {
      act.mutate({ key, action })
    },
  }

  return (
    <section className="page board-page">
      <h1 className="page-title">{t('Tickets', 'Ticket')}</h1>
      <div className="board-bar">
        <Segmented
          label={t('Board view', 'Chế độ xem')}
          value={activeView}
          options={VIEW_IDS.map((id) => ({ value: id, label: viewLabel(id, counts[id]) }))}
          onChange={(picked) => {
            setView(picked)
            setPickedForSearch(debouncedSearch)
          }}
        />
        {canAct ? (
          <button
            type="button"
            className="button secondary check-now"
            disabled={check.isPending}
            onClick={() => {
              check.mutate()
            }}
          >
            {check.isPending ? <span className="spinner" aria-hidden="true" /> : null}
            {t('Check now', 'Kiểm tra ngay')}
          </button>
        ) : null}
        {board.data === undefined ? null : (
          <PollStatus board={board.data} language={language} timeZone={timeZone} />
        )}
      </div>
      <div className="board-search">
        <input
          type="search"
          className="input"
          placeholder={
            canAct
              ? t('Search or add a ticket', 'Tìm hoặc thêm ticket')
              : t('Search tickets', 'Tìm ticket')
          }
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setAddError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void addTypedTicket()
            }
          }}
        />
        {addableKey === null || !canAct ? null : (
          <button type="button" className="button primary" onClick={() => void addTypedTicket()}>
            {t(`Add ${addableKey}`, `Thêm ${addableKey}`)}
          </button>
        )}
      </div>
      {check.isError ? <p className="status danger">{errorText({ code: 'pollFailed' })}</p> : null}
      {addError === null ? null : <p className="status danger">{addError}</p>}
      {board.data === undefined ? (
        <p className="muted">{t('Loading...', 'Đang tải...')}</p>
      ) : !board.data.connected ? (
        <div className="board-empty">
          <p className="muted">
            {t('Jira is not connected - open Settings', 'Chưa kết nối Jira - mở Cài đặt')}
          </p>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              navigateTo('settings')
            }}
          >
            {t('Open Settings', 'Mở Cài đặt')}
          </button>
        </div>
      ) : listProps.rows.length === 0 ? (
        <p className="muted">{t('No tickets', 'Không có ticket')}</p>
      ) : narrow ? (
        <BoardCards {...listProps} />
      ) : (
        <BoardTable {...listProps} />
      )}
    </section>
  )
}
