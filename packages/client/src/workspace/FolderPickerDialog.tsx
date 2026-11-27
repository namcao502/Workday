import { Folder } from '@gravity-ui/icons'
import { Button, Modal, Spinner } from '@heroui/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getFolders } from '../api/workspaceApi.js'
import { t } from '../i18n.js'
import { Tip } from '../ui/Tip.js'

interface FolderPickerDialogProps {
  readonly startPath: string | null // null = the home folder
  readonly onChoose: (folder: string) => void
  readonly onClose: () => void
}

// A folder picker over the server's disk: step into folders, then choose the one shown.
export function FolderPickerDialog({
  startPath,
  onChoose,
  onClose,
}: FolderPickerDialogProps): React.JSX.Element {
  const [path, setPath] = useState<string | null>(startPath)
  const listing = useQuery({ queryKey: ['folders', path], queryFn: () => getFolders(path) })
  const current = listing.data
  const title = t('workspace.chooseAFolder')
  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <Modal.Container>
        <Modal.Dialog aria-label={title} className="sm:max-w-xl">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{title}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                isDisabled={current?.parent === undefined || current.parent === null}
                onPress={() => {
                  if (current?.parent !== undefined && current.parent !== null) {
                    setPath(current.parent)
                  }
                }}
              >
                {t('workspace.up')}
              </Button>
              <Tip
                className="block min-w-0 flex-1 truncate text-sm text-muted"
                content={current?.path}
                whenTruncated
              >
                {current === undefined
                  ? ''
                  : current.path === ''
                    ? t('workspace.thisComputer')
                    : current.path}
              </Tip>
            </div>
            <div className="flex max-h-80 min-h-40 flex-col gap-1 overflow-y-auto">
              {listing.isError ? (
                <p className="text-sm text-danger">{t('workspace.theFolderCouldNotBeRead')}</p>
              ) : current === undefined ? (
                <Spinner size="sm" aria-label={t('workspace.loading')} />
              ) : current.folders.length === 0 ? (
                <p className="text-sm text-muted">{t('workspace.noSubfolders')}</p>
              ) : (
                current.folders.map((folder) => (
                  <button
                    key={folder.path}
                    type="button"
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-secondary"
                    onClick={() => {
                      setPath(folder.path)
                    }}
                  >
                    <Folder width={16} height={16} aria-hidden="true" />
                    <span className="truncate">{folder.name}</span>
                  </button>
                ))
              )}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onPress={onClose}>
              {t('workspace.cancel')}
            </Button>
            <Button
              variant="primary"
              isDisabled={current === undefined || current.path === ''}
              onPress={() => {
                if (current !== undefined && current.path !== '') {
                  onChoose(current.path)
                }
              }}
            >
              {t('workspace.chooseThisFolder')}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
