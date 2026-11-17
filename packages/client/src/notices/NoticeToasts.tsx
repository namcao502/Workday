import { noticeText, type Notice } from '@workday/core'
import { Card, CloseButton } from '@heroui/react'
import { useEffect } from 'react'
import { getLanguage, t } from '../i18n.js'
import type { NoticeAlerts } from './useNotices.js'

export const TOAST_MS = 6000

// The card itself is opaque like the bell's popup; the tone shows as a small dot before the text.
const TONE_DOT: Readonly<Record<Notice['tone'], string>> = {
  info: 'bg-accent',
  success: 'bg-success',
  error: 'bg-danger',
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
    <Card className={`w-80 max-w-[92vw] flex-row items-start gap-0 bg-overlay p-0 shadow-overlay`}>
      <button
        type="button"
        className="flex flex-1 cursor-pointer items-start gap-2 p-3 text-left text-sm"
        onClick={() => {
          alerts.open(notice)
        }}
      >
        <span
          className={`mt-1.5 size-2 flex-none rounded-full ${TONE_DOT[notice.tone]}`}
          aria-hidden="true"
        />
        <span className="min-w-0">{noticeText(notice.event, getLanguage())}</span>
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
