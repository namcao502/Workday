import { noticeText, type Notice } from '@workday/core'
import { Badge, Button, Popover } from '@heroui/react'
import { Bell } from '@gravity-ui/icons'
import { useState } from 'react'
import { useAccess } from '../api/useMe.js'
import { useSettings } from '../api/useSettings.js'
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
        {notice.read ? null : <span className="visually-hidden">{t('Unread', 'Chưa đọc')}</span>}
      </button>
    </li>
  )
}

export function NoticeBell(): React.JSX.Element | null {
  const view = useNoticesView().data
  const actions = useNoticeActions()
  const remote = useAccess().mode === 'remote'
  const timeZone = useTimeZone()
  const [open, setOpen] = useState(false)
  if (view === undefined) {
    return null
  }
  const newestFirst = [...view.notices].reverse()

  function openNotice(notice: Notice): void {
    setOpen(false)
    openNoticeTarget(notice.target, remote)
    void actions.read(notice.id)
  }

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Badge.Anchor>
        <Button isIconOnly variant="ghost" aria-label={t('Notices', 'Thông báo')}>
          <Bell width={20} height={20} aria-hidden="true" />
        </Button>
        {view.unread === 0 ? null : (
          <Badge color="danger" size="sm" placement="top-right" data-testid="notice-unread">
            {badgeText(view.unread)}
          </Badge>
        )}
      </Badge.Anchor>
      <Popover.Content placement="bottom end">
        <Popover.Dialog className="w-[360px] max-w-[92vw]">
          <div className="flex items-center justify-between pb-2">
            <Popover.Heading className="font-semibold">
              {t('Notifications', 'Thông báo')}
            </Popover.Heading>
            <Button
              size="sm"
              variant="ghost"
              isDisabled={view.unread === 0}
              onPress={() => {
                void actions.readAll()
              }}
            >
              {t('Mark all read', 'Đánh dấu đã đọc tất cả')}
            </Button>
          </div>
          {newestFirst.length === 0 ? (
            <p className="text-sm text-muted">{t('No notifications yet', 'Chưa có thông báo')}</p>
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
