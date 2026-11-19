import { noticeText, type Notice } from '@workday/core'
import { Badge, Button, Popover, Spinner } from '@heroui/react'
import { Bell } from '@gravity-ui/icons'
import { useState } from 'react'
import { useAccess } from '../api/useMe.js'
import { useSettings } from '../api/useSettings.js'
import { useGlobalBusy, useRunningWork } from '../shell/useGlobalBusy.js'
import { formatShortDate, getLanguage, t } from '../i18n.js'
import { openNoticeTarget } from './noticeTarget.js'
import { useNoticeActions, useNoticesView } from './useNotices.js'

const MAX_BADGE = 99

export function badgeText(unread: number): string {
  return unread > MAX_BADGE ? `${String(MAX_BADGE)}+` : String(unread)
}

// The settings may be unreadable on a remote device, so the browser's own zone is the fallback.
function useTimeZone(): string {
  return useSettings().data?.config.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
}

const TONE_TEXT: Readonly<Record<Notice['tone'], string>> = {
  info: '',
  success: 'text-success',
  error: 'text-danger',
}

function NoticeItem({
  notice,
  timeZone,
  onOpen,
}: {
  readonly notice: Notice
  readonly timeZone: string
  readonly onOpen: (notice: Notice) => void
}): React.JSX.Element {
  return (
    <li>
      <button
        type="button"
        className={`flex w-full cursor-pointer gap-2 rounded-lg p-2 text-left hover:bg-default ${TONE_TEXT[notice.tone]}`}
        onClick={() => {
          onOpen(notice)
        }}
      >
        <span
          className={`mt-1.5 size-2 flex-none rounded-full ${notice.read ? '' : 'bg-accent'}`}
          aria-hidden="true"
        />
        <span className="flex flex-col">
          <span className="text-sm">{noticeText(notice.event, getLanguage())}</span>
          <span className="text-xs text-muted">
            {formatShortDate(new Date(notice.at), getLanguage(), timeZone)}
          </span>
        </span>
        {notice.read ? null : <span className="visually-hidden">{t('notices.unread')}</span>}
      </button>
    </li>
  )
}

// The work running now, first in the list so a click on the spinning bell says what loads (WPF NoticeHistoryView).
function RunningWork({ labels }: { readonly labels: readonly string[] }): React.JSX.Element | null {
  if (labels.length === 0) {
    return null
  }
  return (
    <section className="mb-2 rounded-xl bg-surface-secondary p-2" aria-live="polite">
      <h3 className="m-0 pb-1 text-sm font-semibold">{t('notices.runningNow')}</h3>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {labels.map((label) => (
          <li key={label} className="flex items-start gap-2 text-sm text-muted">
            <span className="mt-1.5 size-2 flex-none rounded-full bg-accent" aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function NoticeBell(): React.JSX.Element {
  const view = useNoticesView().data
  const actions = useNoticeActions()
  const remote = useAccess().mode === 'remote'
  const timeZone = useTimeZone()
  const busy = useGlobalBusy()
  const running = useRunningWork()
  const [open, setOpen] = useState(false)
  // Shown before the notices load too: the first load of the page spins in it.
  const unread = view?.unread ?? 0
  const newestFirst = view === undefined ? [] : [...view.notices].reverse()

  function openNotice(notice: Notice): void {
    setOpen(false)
    openNoticeTarget(notice.target, remote)
    void actions.read(notice.id)
  }

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      {/* notice-bell: a season can dress the bell (a Santa hat at Christmas, season.css). */}
      <Badge.Anchor className="notice-bell">
        {/* While work runs the bell glyph is the spinner, as in the WPF app (BusyIndicator). */}
        <Button
          isIconOnly
          variant="secondary"
          aria-label={busy ? t('notices.noticesWorkRunning') : t('notices.notices')}
        >
          {busy ? (
            <Spinner size="sm" aria-hidden="true" />
          ) : (
            <Bell width={20} height={20} aria-hidden="true" />
          )}
        </Button>
        {unread === 0 ? null : (
          <Badge color="danger" size="sm" placement="top-right" data-testid="notice-unread">
            {badgeText(unread)}
          </Badge>
        )}
      </Badge.Anchor>
      <Popover.Content placement="bottom end">
        <Popover.Dialog className="w-[360px] max-w-[92vw]">
          <RunningWork labels={running} />
          <div className="flex items-center justify-between pb-2">
            <Popover.Heading className="font-semibold">
              {t('notices.notifications')}
            </Popover.Heading>
            <Button
              size="sm"
              variant="secondary"
              isDisabled={unread === 0}
              onPress={() => {
                void actions.readAll()
              }}
            >
              {t('notices.markAllRead')}
            </Button>
          </div>
          {view === undefined ? (
            <p className="text-sm text-muted">{t('notices.loading')}</p>
          ) : newestFirst.length === 0 ? (
            <p className="text-sm text-muted">{t('notices.noNotificationsYet')}</p>
          ) : (
            <ul className="m-0 max-h-[420px] list-none overflow-auto p-0">
              {newestFirst.map((notice) => (
                <NoticeItem
                  key={notice.id}
                  notice={notice}
                  timeZone={timeZone}
                  onOpen={openNotice}
                />
              ))}
            </ul>
          )}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}
