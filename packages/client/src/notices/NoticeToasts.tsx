import { noticeText, type Notice } from '@workday/core'
import { Card, CloseButton } from '@heroui/react'
import { useEffect } from 'react'
import { getLanguage, t } from '../i18n.js'
import type { NoticeAlerts } from './useNotices.js'

export const TOAST_MS = 6000

// The card itself is opaque like the bell's popup; the tone shows as a stripe on its left edge.
const TONE_STRIPE: Readonly<Record<Notice['tone'], string>> = {
  info: 'border-accent',
  success: 'border-success',
  error: 'border-danger',
}

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
    <Card
      className={`w-80 max-w-[92vw] flex-row items-start gap-0 border-l-4 bg-overlay p-0 shadow-overlay ${TONE_STRIPE[notice.tone]}`}
    >
      <button
        type="button"
        className="flex-1 cursor-pointer p-3 text-left text-sm"
        onClick={() => {
          alerts.open(notice)
        }}
      >
        {noticeText(notice.event, getLanguage())}
      </button>
      <CloseButton
        className="m-1.5"
        aria-label={t('Dismiss', 'Đóng')}
        onPress={() => {
          alerts.dismiss(notice)
        }}
      />
    </Card>
  )
}

// Top-right stack under the bell; a toast closes itself after six seconds without reading the notice.
export function NoticeToasts({ alerts }: { readonly alerts: NoticeAlerts }): React.JSX.Element {
  return (
    <div className="fixed right-4 top-16 z-30 flex flex-col gap-2" role="status">
      {alerts.toasts.map((notice) => (
        <Toast key={notice.id} notice={notice} alerts={alerts} />
      ))}
    </div>
  )
}
