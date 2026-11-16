import { LayoutSideContent } from '@gravity-ui/icons'
import { Button } from '@heroui/react'
import { useState } from 'react'
import { useFileContent, useFiles } from '../api/useWorkspace.js'
import { openInVsCode } from '../api/workspaceApi.js'
import { t } from '../i18n.js'
import { CopyPath } from '../ui/CopyPath.js'
import { SplitView } from '../ui/SplitView.js'
import { useStoredSplit } from '../ui/useStoredSplit.js'
import { FileViewer } from './FileViewer.js'
import { GroupTrees, type FileRef } from './GroupTrees.js'

interface FilesViewProps {
  readonly tabId: string
}

const LIST_SHARE = 0.3
const LIST_MIN_PX = 160
const DOCS_GROUP = 'docs'
const DEFAULT_DOCS = ['plan.md', 'ticket.md']

function OpenFile({
  tabId,
  file,
  knownPaths,
  onSelect,
}: {
  readonly tabId: string
  readonly file: FileRef
  readonly knownPaths: readonly string[]
  readonly onSelect: (ref: FileRef) => void
}): React.JSX.Element {
  const { data, isError } = useFileContent(tabId, file.group, file.path)
  if (isError) {
    return (
      <p className="text-sm text-danger">{t('Could not read the file.', 'Không đọc được tệp.')}</p>
    )
  }
  if (data === undefined) {
    return <p className="text-sm text-muted">{t('Loading...', 'Đang tải...')}</p>
  }
  return (
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
  )
}

export function FilesView({ tabId }: FilesViewProps): React.JSX.Element {
  const { data } = useFiles(tabId)
  const [chosen, setChosen] = useState<FileRef | null>(null)
  const split = useStoredSplit('files')
  const groups = data ?? []
  const docs = groups.find((group) => group.id === DOCS_GROUP)
  const defaultDoc = DEFAULT_DOCS.map((name) => docs?.paths.find((path) => path === name)).find(
    (path) => path !== undefined,
  )
  const selected =
    chosen ?? (defaultDoc === undefined ? null : { group: DOCS_GROUP, path: defaultDoc })
  const known = groups.find((group) => group.id === selected?.group)?.paths ?? []

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-1 pb-1">
        <Button
          isIconOnly
          variant="secondary"
          size="sm"
          aria-label={t('Show or hide the file list', 'Ẩn / hiện danh sách file')}
          aria-pressed={split.hidden === 'none'}
          onPress={() => {
            split.setHidden(split.hidden === 'none' ? 'left' : 'none')
          }}
        >
          <LayoutSideContent />
        </Button>
        {selected === null ? null : <CopyPath text={selected.path} />}
      </div>
      <SplitView
        className="flex-1"
        share={split.share ?? LIST_SHARE}
        onShareChange={split.setShare}
        hidden={split.hidden}
        minPx={LIST_MIN_PX}
        left={
          <div className="min-h-0 flex-1 overflow-auto pr-2 [scrollbar-gutter:stable]">
            <GroupTrees
              groups={groups}
              selected={selected}
              onSelect={setChosen}
              defaultOpen={false}
            />
          </div>
        }
        right={
          <div className="min-h-0 flex-1 overflow-auto pr-2 [scrollbar-gutter:stable]">
            {selected === null ? null : (
              <OpenFile
                key={`${selected.group}:${selected.path}`}
                tabId={tabId}
                file={selected}
                knownPaths={known}
                onSelect={setChosen}
              />
            )}
          </div>
        }
      />
    </div>
  )
}
