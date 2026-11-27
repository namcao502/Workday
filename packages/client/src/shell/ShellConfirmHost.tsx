import { AlertDialog, Button } from '@heroui/react'
import { useEffect, useState } from 'react'
import { answerShellConfirm, onShellConfirm, type ShellConfirm } from './desktopHost.js'

// The desktop shell's questions (build and restart, update the app) as the app's own dialog, one at a time.
export function ShellConfirmHost(): React.JSX.Element | null {
  const [queue, setQueue] = useState<readonly ShellConfirm[]>([])
  useEffect(
    () =>
      onShellConfirm((confirm) => {
        setQueue((current) => [...current, confirm])
      }),
    [],
  )
  const current = queue[0]
  if (current === undefined) {
    return null
  }
  const answer = (value: boolean): void => {
    answerShellConfirm(current.id, value)
    setQueue((items) => items.filter((item) => item.id !== current.id))
  }
  const isNotice = current.cancelLabel === null
  return (
    <AlertDialog.Backdrop
      isOpen
      isKeyboardDismissDisabled={false}
      onOpenChange={(open) => {
        if (!open) {
          answer(false)
        }
      }}
    >
      <AlertDialog.Container>
        <AlertDialog.Dialog role="dialog" aria-label={current.title}>
          <AlertDialog.Header>
            <AlertDialog.Icon status={isNotice ? 'warning' : 'accent'} />
            <AlertDialog.Heading>{current.title}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <p>{current.message}</p>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            {current.cancelLabel === null ? null : (
              <Button
                variant="secondary"
                onPress={() => {
                  answer(false)
                }}
              >
                {current.cancelLabel}
              </Button>
            )}
            <Button
              variant="primary"
              onPress={() => {
                answer(!isNotice)
              }}
            >
              {current.confirmLabel}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  )
}
