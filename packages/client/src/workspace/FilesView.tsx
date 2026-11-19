import { LayoutSideContent } from '@gravity-ui/icons'
import { Button } from '@heroui/react'
import { useEffect, useRef, useState } from 'react'
import { useFileContent, useFiles, useRefreshTabFiles } from '../api/useWorkspace.js'
import { openInVsCode } from '../api/workspaceApi.js'
import { t } from '../i18n.js'
import { CopyPath } from '../ui/CopyPath.js'
import { FindablePane } from '../ui/FindablePane.js'
import { SplitView } from '../ui/SplitView.js'
import { useStoredSplit } from '../ui/useStoredSplit.js'
import { useListPane } from './useListPane.js'
import { FileViewer } from './FileViewer.js'
import { GroupTrees, type FileRef } from './GroupTrees.js'
import type { OpenFileRequest } from './fileLinks.js'

interface FilesViewProps {
  readonly tabId: string
  readonly request?: OpenFileRequest | null // a file link from the chat: open it, at its line
}

const LIST_SHARE = 0.3
const LIST_MIN_PX = 200
const DOCS_GROUP = 'docs'
const DEFAULT_DOCS = ['plan.md', 'ticket.md']

function OpenFile({
  tabId,
  file,
  knownPaths,
  onSelect,
  line = null,
}: {
  readonly tabId: string
  readonly file: FileRef
  readonly knownPaths: readonly string[]
  readonly onSelect: (ref: FileRef) => void
  readonly line?: number | null // brought into view once the text is shown
}): React.JSX.Element {
  const { data, isError } = useFileContent(tabId, file.group, file.path)
  const shown = useRef<HTMLDivElement>(null)
  const loaded = data !== undefined
  useEffect(() => {
    const target =
      line === null ? undefined : shown.current?.querySelectorAll('.code-number')[line - 1]
    if (loaded && target !== undefined && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center' })
    }
  }, [loaded, line])
  if (isError) {
    return <p className="text-sm text-danger">{t('workspace.couldNotReadTheFile')}</p>
  }
  if (data === undefined) {
    return <p className="text-sm text-muted">{t('workspace.loading')}</p>
  }
  return (
    <div ref={shown}>
      <FileViewer
        tabId={tabId}
        group={file.group}
        path={file.path}
        content={data}
        knownPaths={knownPaths}
        onSelectPath={(path) => {
          onSelect({ group: file.group, path })
        }}
        onOpenInEditor={() => {
          void openInVsCode(tabId, file.group, file.path)
        }}
      />
    </div>
  )
}

export function FilesView({ tabId, request = null }: FilesViewProps): React.JSX.Element {
  const { data } = useFiles(tabId)
  const { refresh, refreshing } = useRefreshTabFiles(tabId)
  const [chosen, setChosen] = useState<FileRef | null>(
    request === null ? null : { group: request.group, path: request.path },
  )
  useEffect(() => {
    if (request !== null) {
      setChosen({ group: request.group, path: request.path })
    }
  }, [request])
  const split = useStoredSplit('files')
  const groups = data ?? []
  const docs = groups.find((group) => group.id === DOCS_GROUP)
  const defaultDoc = DEFAULT_DOCS.map((name) => docs?.paths.find((path) => path === name)).find(
    (path) => path !== undefined,
  )
  const selected =
    chosen ?? (defaultDoc === undefined ? null : { group: DOCS_GROUP, path: defaultDoc })
  const pane = useListPane(split, selected !== null)
  const known = groups.find((group) => group.id === selected?.group)?.paths ?? []

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-1 pb-1">
        <Button
          isIconOnly
          variant="secondary"
          size="sm"
          aria-label={t('workspace.showOrHideTheFileList')}
          aria-pressed={pane.listShown}
          onPress={() => {
            pane.toggleList()
          }}
        >
          <LayoutSideContent />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          isDisabled={refreshing}
          onPress={() => {
            void refresh()
          }}
        >
          {t('workspace.refresh')}
        </Button>
        {selected === null ? null : <CopyPath text={selected.path} />}
      </div>
      <SplitView
        className="flex-1"
        share={split.share ?? LIST_SHARE}
        onShareChange={split.setShare}
        hidden={pane.hidden}
        minPx={LIST_MIN_PX}
        left={
          <div className="min-h-0 flex-1 overflow-auto pr-2 [scrollbar-gutter:stable]">
            <GroupTrees
              groups={groups}
              selected={selected}
              onSelect={(ref) => {
                setChosen(ref)
                pane.picked()
              }}
              defaultOpen={false}
            />
          </div>
        }
        right={
          <FindablePane>
            {selected === null ? null : (
              <div key={`${selected.group}:${selected.path}`} className="animate-fade-in">
                <OpenFile
                  tabId={tabId}
                  file={selected}
                  knownPaths={known}
                  onSelect={setChosen}
                  line={
                    request !== null &&
                    request.group === selected.group &&
                    request.path === selected.path
                      ? request.line
                      : null
                  }
                />
              </div>
            )}
          </FindablePane>
        }
      />
    </div>
  )
}
