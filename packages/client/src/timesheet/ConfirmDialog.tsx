import { useEffect } from 'react'
import { t } from '../i18n.js'

interface ConfirmDialogProps {
  readonly message: string
  readonly confirmLabel: string
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

export function ConfirmDialog({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element {
  useEffect(() => {
    function cancelOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onCancel()
      }
    }
    document.addEventListener('keydown', cancelOnEscape)
    return () => {
      document.removeEventListener('keydown', cancelOnEscape)
    }
  }, [onCancel])

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-label={confirmLabel}>
        <p className="dialog-message">{message}</p>
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onCancel}>
            {t('Cancel', 'Hủy')}
          </button>
          <button type="button" className="button danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
