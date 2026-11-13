import type { BoardRow, TodoGroup, TodoItem } from '@workday/core'
import { useState } from 'react'
import { useAccess } from '../api/useMe.js'
import { actionErrorText, useRepoLabels, useWorkActions } from '../api/useWork.js'
import { t, type Language } from '../i18n.js'
import { navigateToWorkspace } from '../shell/pages.js'
import { KeyPill } from './KeyPill.js'
import type { RowWorkspace } from './RowMenu.js'
import { TodoRow, type TodoButton } from './TodoRow.js'
import { todoText } from './todoText.js'

interface TodoViewProps {
  readonly groups: readonly TodoGroup[]
  readonly rows: readonly BoardRow[]
  readonly language: Language
  readonly workspace?: RowWorkspace | undefined
  readonly onDone: (ticketKey: string) => void
  readonly onReadyToTest: (ticketKey: string, steps: readonly string[]) => void
}

const ICONS: Readonly<Record<TodoItem['kind'], string>> = {
  claudeWaiting: 'C',
  readyToTest: '>',
  prReview: 'R',
  prBlocked: '!',
  prComments: '#',
  jiraDone: '✓',
  overdue: '!',
}

function overdueButton(ticketKey: string, workspace: RowWorkspace): TodoButton {
  if (workspace.openKeys.has(ticketKey)) {
    return {
      id: 'open',
      label: t('Open', 'Mở'),
      onClick: () => {
        workspace.onOpen(ticketKey)
      },
    }
  }
  return {
    id: 'start',
    label: t('Start', 'Bắt đầu'),
    disabled: workspace.starting.has(ticketKey),
    onClick: () => {
      workspace.onStart(ticketKey)
    },
  }
}

interface GroupHeaderProps {
  readonly ticketKey: string | null
  readonly rows: readonly BoardRow[]
}

function GroupHeader({ ticketKey, rows }: GroupHeaderProps): React.JSX.Element | null {
  if (ticketKey === null) {
    return null
  }
  const row = rows.find((candidate) => candidate.ticket.key === ticketKey)
  return (
    <div className="todo-group-head">
      {row === undefined ? (
        <span className="pill key-pill">{ticketKey}</span>
      ) : (
        <KeyPill ticketKey={ticketKey} url={row.url} />
      )}
      <span className="board-summary">{row?.ticket.summary ?? ''}</span>
    </div>
  )
}

export function TodoView({
  groups,
  rows,
  language,
  workspace,
  onDone,
  onReadyToTest,
}: TodoViewProps): React.JSX.Element {
  const access = useAccess()
  const canAct = access.canAct('board')
  const actions = useWorkActions()
  const repoLabels = useRepoLabels()
  const [message, setMessage] = useState<string | null>(null)
  const ticketOf = (key: string): BoardRow['ticket'] | undefined =>
    rows.find((row) => row.ticket.key === key)?.ticket

  async function run(call: () => Promise<void>): Promise<void> {
    setMessage(null)
    try {
      await call()
    } catch (error: unknown) {
      setMessage(actionErrorText(error))
    }
  }

  function buttonsFor(item: TodoItem): readonly TodoButton[] {
    switch (item.kind) {
      case 'claudeWaiting':
        return access.mode === 'remote'
          ? []
          : [
              {
                id: 'open',
                label: t('Open', 'Mở'),
                onClick: () => {
                  navigateToWorkspace(item.tab, item.session)
                },
              },
            ]
      case 'readyToTest': {
        const failedBuild = item.deploy?.failedBuild ?? null
        const move: readonly TodoButton[] = canAct
          ? [
              {
                id: 'move',
                label: item.steps.map((step) => `-> ${step}`).join(' '),
                onClick: () => {
                  onReadyToTest(item.ticketKey, item.steps)
                },
              },
            ]
          : []
        const build: readonly TodoButton[] =
          failedBuild === null
            ? []
            : [{ id: 'build', label: t('View build', 'Xem build'), href: failedBuild.url }]
        return [...move, ...build]
      }
      case 'prReview': {
        const { review } = item
        const view: TodoButton = { id: 'view', label: t('View PR', 'Xem PR'), href: review.url }
        const hide: TodoButton = {
          id: 'hide',
          label: t('Hide', 'Ẩn'),
          onClick: () => {
            void run(() => actions.hideReview(review.repository, review.pullRequestId))
          },
        }
        return canAct ? [view, hide] : [view]
      }
      case 'prBlocked':
        return [{ id: 'view', label: t('View PR', 'Xem PR'), href: item.pr.pr.url }]
      case 'prComments':
        return [
          {
            id: 'view',
            label: t('View PR', 'Xem PR'),
            href: item.url,
            onClick: () => {
              if (canAct) {
                void run(() => actions.commentsSeen(item.ticketKey))
              }
            },
          },
        ]
      case 'jiraDone':
        return canAct
          ? [
              {
                id: 'done',
                label: t('Mark done', 'Đánh dấu xong'),
                onClick: () => {
                  onDone(item.ticketKey)
                },
              },
            ]
          : []
      case 'overdue':
        return workspace === undefined ? [] : [overdueButton(item.ticketKey, workspace)]
    }
  }

  return (
    <div className="todo-view">
      {message === null ? null : (
        <p className="status" role="status">
          {message}
        </p>
      )}
      {groups.map((group, index) => (
        <section
          key={group.ticketKey ?? `group-${String(index)}`}
          className={group.neededNow ? 'todo-group todo-group-now' : 'todo-group'}
        >
          <GroupHeader ticketKey={group.ticketKey} rows={rows} />
          <ul className="todo-list">
            {group.items.map((item, itemIndex) => {
              const text = todoText(item, { ticketOf, repoLabels, language })
              return (
                <TodoRow
                  key={`${item.kind}-${String(itemIndex)}`}
                  icon={ICONS[item.kind]}
                  tone={text.tone}
                  title={text.title}
                  detail={text.detail}
                  buttons={buttonsFor(item)}
                />
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
