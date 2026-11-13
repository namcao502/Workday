import { AlertDialog, Button } from '@heroui/react'
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
  return (
    <AlertDialog.Backdrop
      isOpen
      isKeyboardDismissDisabled={false}
      onOpenChange={(open) => {
        if (!open) {
          onCancel()
        }
      }}
    >
      <AlertDialog.Container>
        {/* role "dialog" keeps the queries the pages' tests already use */}
        <AlertDialog.Dialog role="dialog" aria-label={confirmLabel}>
          <AlertDialog.Body>
            <p>{message}</p>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button variant="secondary" onPress={onCancel}>
              {t('Cancel', 'Hủy')}
            </Button>
            <Button variant="danger" onPress={onConfirm}>
              {confirmLabel}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  )
}
