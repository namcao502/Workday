import { useState } from 'react'
import { useFileContent, useFiles } from '../api/useWorkspace.js'
import { openInVsCode } from '../api/workspaceApi.js'
import { t } from '../i18n.js'
import { FileViewer } from './FileViewer.js'
import { GroupTrees, type FileRef } from './GroupTrees.js'

interface FilesViewProps {
  readonly tabId: string
}

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
  const groups = data ?? []
  const docs = groups.find((group) => group.id === DOCS_GROUP)
  const defaultDoc = DEFAULT_DOCS.map((name) => docs?.paths.find((path) => path === name)).find(
    (path) => path !== undefined,
  )
  const selected =
    chosen ?? (defaultDoc === undefined ? null : { group: DOCS_GROUP, path: defaultDoc })
  const known = groups.find((group) => group.id === selected?.group)?.paths ?? []

  return (
    <div className="flex flex-col gap-2">
      <GroupTrees groups={groups} selected={selected} onSelect={setChosen} defaultOpen={false} />
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
  )
}
