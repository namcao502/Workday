import type { ChangeStatus } from '@workday/core'
import { Button } from '@heroui/react'
import { useEffect, useMemo, useState } from 'react'
import { useChanges } from '../api/useWorkspace.js'
import { t } from '../i18n.js'
import { buildTree, treeOrder } from './buildTree.js'
import { DiffView } from './DiffView.js'
import { GroupTrees, type FileRef, type TreeGroup } from './GroupTrees.js'

interface ChangesViewProps {
  readonly tabId: string
}

function sameRef(a: FileRef | null, b: FileRef): boolean {
  return a !== null && a.group === b.group && a.path === b.path
}

export function ChangesView({ tabId }: ChangesViewProps): React.JSX.Element {
  const { data, refetch, isFetching } = useChanges(tabId)
  const [chosen, setChosen] = useState<FileRef | null>(null)
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
    <div className="flex flex-col gap-2">
      <div className="pb-1">
        <Button
          variant="ghost"
          size="sm"
          isDisabled={isFetching}
          onPress={() => {
            void refetch()
          }}
        >
          {t('Refresh', 'Làm mới')}
        </Button>
      </div>
      <GroupTrees groups={groups} selected={selected} onSelect={setChosen} defaultOpen />
      {data !== undefined && order.length === 0 ? (
        <p className="text-sm text-muted">{t('No changes', 'Không có thay đổi')}</p>
      ) : null}
      {selected === null ? null : (
        <DiffView key={`${selected.group}:${selected.path}`} tabId={tabId} {...selected} />
      )}
    </div>
  )
}
