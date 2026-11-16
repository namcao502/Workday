import type { ChangeStatus } from '@workday/core'
import { LayoutSideContent } from '@gravity-ui/icons'
import { Button } from '@heroui/react'
import { useEffect, useMemo, useState } from 'react'
import { useChanges } from '../api/useWorkspace.js'
import { t } from '../i18n.js'
import { CopyPath } from '../ui/CopyPath.js'
import { FindablePane } from '../ui/FindablePane.js'
import { SplitView } from '../ui/SplitView.js'
import { useStoredSplit } from '../ui/useStoredSplit.js'
import { buildTree, treeOrder } from './buildTree.js'
import { DiffView } from './DiffView.js'
import { GroupTrees, type FileRef, type TreeGroup } from './GroupTrees.js'

const LIST_SHARE = 0.3
const LIST_MIN_PX = 160

interface ChangesViewProps {
  readonly tabId: string
}

function sameRef(a: FileRef | null, b: FileRef): boolean {
  return a !== null && a.group === b.group && a.path === b.path
}

export function ChangesView({ tabId }: ChangesViewProps): React.JSX.Element {
  const { data, refetch, isFetching } = useChanges(tabId)
  const [chosen, setChosen] = useState<FileRef | null>(null)
  const split = useStoredSplit('changes')
  const groups = useMemo<readonly TreeGroup[]>(
    () =>
      (data ?? []).map((group) => ({
        id: group.id,
        label: group.label,
        paths: group.files.map((file) => file.path),
        error: group.error,
        statuses: new Map<string, ChangeStatus>(
          group.files.map((file) => [file.path, file.status]),
        ),
      })),
    [data],
  )
  const order = useMemo<readonly FileRef[]>(
    () =>
      groups.flatMap((group) =>
        treeOrder(buildTree(group.paths)).map((path) => ({ group: group.id, path })),
      ),
    [groups],
  )
  // A selection that left the change list falls back to the first file.
  const selected = order.find((ref) => sameRef(chosen, ref)) ?? order[0] ?? null

  useEffect(() => {
    function handleKey(event: KeyboardEvent): void {
      if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) {
        return
      }
      const current = order.findIndex((ref) => sameRef(selected, ref))
      const next = order[current + (event.key === 'ArrowUp' ? -1 : 1)]
      if (next !== undefined) {
        event.preventDefault()
        setChosen(next)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
    }
  }, [order, selected])

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
        <Button
          variant="secondary"
          size="sm"
          isDisabled={isFetching}
          onPress={() => {
            void refetch()
          }}
        >
          {t('Refresh', 'Làm mới')}
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
            <GroupTrees groups={groups} selected={selected} onSelect={setChosen} defaultOpen />
            {data !== undefined && order.length === 0 ? (
              <p className="text-sm text-muted">{t('No changes', 'Không có thay đổi')}</p>
            ) : null}
          </div>
        }
        right={
          <FindablePane>
            {selected === null ? null : (
              <div key={`${selected.group}:${selected.path}`} className="animate-fade-in">
                <DiffView tabId={tabId} {...selected} />
              </div>
            )}
          </FindablePane>
        }
      />
    </div>
  )
}
