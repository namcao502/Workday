import { Button, Chip, Modal } from '@heroui/react'
import type { CleanupError, CleanupRow } from '@workday/core'
import { useState } from 'react'
import { useCleanup, useCleanupRun, type CleanupRun } from '../api/cleanupApi.js'
import { t } from '../i18n.js'
import { ConfirmDialog } from '../ui/ConfirmDialog.js'
import {
  cleanupErrorText,
  docsText,
  megabytesText,
  reasonsText,
  verdictColor,
  verdictText,
} from './cleanupText.js'

interface CleanupDialogProps {
  readonly onClose: () => void
}

function canRemove(row: CleanupRow): boolean {
  return row.verdict === 'ready' || row.verdict === 'check'
}

function canSlim(row: CleanupRow): boolean {
  return row.verdict === 'noWorktree' && row.slimBytes > 0
}

function confirmMessage(run: CleanupRun, row: CleanupRow): string {
  if (run.kind === 'slim') {
    const size = megabytesText(row.slimBytes)
    return t('workspace.deleteTheMinedDocsOfMb', { ticketKey: row.ticketKey, size })
  }
  const dirty = String(run.dirtyFiles)
  if (run.dirtyFiles > 0) {
    return t('workspace.removeTheWorktreeOfChangedFile', { ticketKey: row.ticketKey, dirty })
  }
  return t('workspace.removeTheWorktreeOf', { ticketKey: row.ticketKey })
}

interface RowItemProps {
  readonly row: CleanupRow
  readonly error: CleanupError | undefined
  readonly busy: boolean
  readonly onAsk: (run: CleanupRun) => void
}

function RowItem({ row, error, busy, onAsk }: RowItemProps): React.JSX.Element {
  const reasons = reasonsText(row.reasons)
  return (
    <li
      data-testid={`cleanup-row-${row.ticketKey}`}
      className="flex flex-col gap-1 rounded-2xl bg-surface-secondary px-3 py-2"
    >
      <div className="flex items-center gap-3">
        <span className="font-medium">{row.ticketKey}</span>
        <Chip size="sm" color={verdictColor(row.verdict)}>
          {verdictText(row.verdict)}
        </Chip>
        <span className="min-w-0 flex-1 truncate text-sm text-muted">
          {row.repositories.join(', ')}
        </span>
        {canRemove(row) ? (
          <Button
            size="sm"
            variant="danger"
            isDisabled={busy}
            onPress={() => {
              onAsk({ kind: 'remove', key: row.ticketKey, dirtyFiles: row.dirtyFiles })
            }}
          >
            {t('workspace.remove')}
          </Button>
        ) : null}
        {canSlim(row) ? (
          <Button
            size="sm"
            variant="secondary"
            isDisabled={busy}
            onPress={() => {
              onAsk({ kind: 'slim', key: row.ticketKey, dirtyFiles: 0 })
            }}
          >
            {t('workspace.slimDocs')}
          </Button>
        ) : null}
      </div>
      {reasons === '' ? null : <p className="text-sm text-muted">{reasons}</p>}
      <p className="text-xs text-muted">{docsText(row)}</p>
      {error === undefined ? null : (
        <p role="alert" className="text-sm text-danger">
          {cleanupErrorText(error)}
        </p>
      )}
    </li>
  )
}

export function CleanupDialog({ onClose }: CleanupDialogProps): React.JSX.Element {
  const cleanup = useCleanup()
  const run = useCleanupRun()
  const [asking, setAsking] = useState<CleanupRun | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [errors, setErrors] = useState<Readonly<Record<string, CleanupError>>>({})
  const rows = cleanup.data?.rows
  const askingRow = asking === null ? undefined : rows?.find((r) => r.ticketKey === asking.key)

  async function confirmRun(target: CleanupRun): Promise<void> {
    setAsking(null)
    setBusyKey(target.key)
    const others = Object.fromEntries(Object.entries(errors).filter(([key]) => key !== target.key))
    setErrors(others)
    try {
      const outcome = await run(target)
      if (!outcome.ok) {
        setErrors({ ...others, [target.key]: outcome.error })
      }
    } catch {
      setErrors({ ...others, [target.key]: { code: 'ioFailed' } })
    } finally {
      setBusyKey(null)
    }
  }

  let body: React.JSX.Element
  if (cleanup.isError) {
    body = <p className="text-sm text-danger">{t('workspace.theListCouldNotBeLoaded')}</p>
  } else if (rows === undefined) {
    body = <p className="text-sm text-muted">{t('workspace.loading')}</p>
  } else if (rows.length === 0) {
    body = <p className="text-sm text-muted">{t('workspace.nothingToCleanUpIfYou')}</p>
  } else {
    body = (
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <RowItem
            key={row.ticketKey}
            row={row}
            error={errors[row.ticketKey]}
            busy={busyKey === row.ticketKey}
            onAsk={setAsking}
          />
        ))}
      </ul>
    )
  }

  return (
    <>
      <Modal.Backdrop
        isOpen
        onOpenChange={(open) => {
          if (!open) {
            onClose()
          }
        }}
      >
        <Modal.Container>
          <Modal.Dialog aria-label={t('workspace.cleanUpWorktrees')} className="sm:max-w-3xl">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{t('workspace.cleanUpWorktrees')}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>{body}</Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
      {asking === null || askingRow === undefined ? null : (
        <ConfirmDialog
          message={confirmMessage(asking, askingRow)}
          confirmLabel={
            asking.kind === 'remove' ? t('workspace.removeWorktree') : t('workspace.slimDocs')
          }
          onConfirm={() => {
            void confirmRun(asking)
          }}
          onCancel={() => {
            setAsking(null)
          }}
        />
      )}
    </>
  )
}
