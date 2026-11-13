import type { AppError, ChangeStatus } from '@workday/core'
import { useMemo } from 'react'
import { errorText } from '../errors.js'
import { FileTree } from './FileTree.js'

export interface TreeGroup {
  readonly id: string
  readonly label: string
  readonly paths: readonly string[]
  readonly error: AppError | null
  readonly statuses?: ReadonlyMap<string, ChangeStatus>
}

export interface FileRef {
  readonly group: string
  readonly path: string
}

interface GroupTreesProps {
  readonly groups: readonly TreeGroup[]
  readonly selected: FileRef | null
  readonly onSelect: (ref: FileRef) => void
  readonly defaultOpen: boolean
}

function GroupSection({
  group,
  selected,
  onSelect,
  defaultOpen,
}: Omit<GroupTreesProps, 'groups'> & { readonly group: TreeGroup }): React.JSX.Element {
  const selectedPath = selected?.group === group.id ? selected.path : null
  const select = useMemo(
    () => (path: string) => {
      onSelect({ group: group.id, path })
    },
    [group.id, onSelect],
  )
  return (
    <section>
      <h3 className="mb-1 mt-2 text-sm font-semibold">{group.label}</h3>
      {group.error === null ? null : (
        <p className="text-sm text-danger">{errorText(group.error)}</p>
      )}
      <FileTree
        paths={group.paths}
        selectedPath={selectedPath}
        onSelect={select}
        defaultOpen={defaultOpen}
        statuses={group.statuses}
      />
    </section>
  )
}

export function GroupTrees({ groups, ...rest }: GroupTreesProps): React.JSX.Element {
  return (
    <div>
      {groups.map((group) => (
        <GroupSection key={group.id} group={group} {...rest} />
      ))}
    </div>
  )
}
