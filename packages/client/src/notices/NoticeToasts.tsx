import { noticeText, type Notice } from '@workday/core'
import { useEffect } from 'react'
import { getLanguage, t } from '../i18n.js'
import type { NoticeAlerts } from './useNotices.js'
import './notices.css'

export const TOAST_MS = 6000

function Toast({
  notice,
  alerts,
}: {
  readonly notice: Notice
  readonly alerts: NoticeAlerts
}): React.JSX.Element {
  const { expire } = alerts
  useEffect(() => {
    const timer = setTimeout(() => {
      expire(notice.id)
    }, TOAST_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [notice.id, expire])
  return (
    <div className={`notice-toast notice-tone-${notice.tone}`}>
      <button
        type="button"
        className="notice-toast-text"
        onClick={() => {
          alerts.open(notice)
        }}
      >
        {noticeText(notice.event, getLanguage())}
      </button>
      <button
        type="button"
        className="notice-toast-close"
        aria-label={t('Dismiss', 'Đóng')}
        onClick={() => {
          alerts.dismiss(notice)
        }}
      >
        x
      </button>
    </div>
  )
}

// Bottom-right stack; a toast closes itself after six seconds without reading the notice.
export function NoticeToasts({ alerts }: { readonly alerts: NoticeAlerts }): React.JSX.Element {
  return (
    <div className="notice-toasts" role="status">
      {alerts.toasts.map((notice) => (
        <Toast key={notice.id} notice={notice} alerts={alerts} />
      ))}
    </div>
  )
}
