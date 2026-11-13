import { noticeText, type Notice } from '@workday/core'
import { useState } from 'react'
import { useAccess } from '../api/useMe.js'
import { useSettings } from '../api/useSettings.js'
import { formatShortDate, getLanguage, t } from '../i18n.js'
import { openNoticeTarget } from './noticeTarget.js'
import { useNoticeActions, useNoticesView } from './useNotices.js'
import './notices.css'

const MAX_BADGE = 99

export function badgeText(unread: number): string {
  return unread > MAX_BADGE ? `${String(MAX_BADGE)}+` : String(unread)
}

// The settings may be unreadable on a remote device, so the browser's own zone is the fallback.
function useTimeZone(): string {
  return useSettings().data?.config.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
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
        className={`notice-item notice-tone-${notice.tone}`}
        onClick={() => {
          onOpen(notice)
        }}
      >
        <span className={notice.read ? 'notice-dot' : 'notice-dot unread'} aria-hidden="true" />
        <span className="notice-item-body">
          <span className="notice-item-text">{noticeText(notice.event, getLanguage())}</span>
          <span className="notice-item-time muted">
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
    <div className="notice-bell">
      <button
        type="button"
        className="button ghost notice-bell-button"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current)
        }}
      >
        {t('Notices', 'Thông báo')}
        {view.unread === 0 ? null : (
          <span className="nav-badge" data-testid="notice-unread">
            {badgeText(view.unread)}
          </span>
        )}
      </button>
      {open ? (
        <div className="notice-panel" role="dialog" aria-label={t('Notifications', 'Thông báo')}>
          <div className="notice-panel-head">
            <strong>{t('Notifications', 'Thông báo')}</strong>
            <button
              type="button"
              className="button ghost"
              disabled={view.unread === 0}
              onClick={() => {
                void actions.readAll()
              }}
            >
              {t('Mark all read', 'Đánh dấu đã đọc tất cả')}
            </button>
          </div>
          {newestFirst.length === 0 ? (
            <p className="muted">{t('No notifications yet', 'Chưa có thông báo')}</p>
          ) : (
            <ul className="notice-list">
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
        </div>
      ) : null}
    </div>
  )
}
