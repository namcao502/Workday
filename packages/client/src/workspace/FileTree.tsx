import type { ChangeStatus } from '@workday/core'
import { useEffect, useMemo, useState } from 'react'
import { t } from '../i18n.js'
import { buildTree, type TreeFolder } from './buildTree.js'

const FILTER_DELAY_MS = 150
const FILTER_LIMIT = 500

interface FileTreeProps {
  readonly paths: readonly string[]
  readonly selectedPath: string | null
  readonly onSelect: (path: string) => void
  readonly defaultOpen: boolean
  readonly statuses?: ReadonlyMap<string, ChangeStatus> | undefined
}

function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value)
    }, FILTER_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [value])
  return debounced
}

interface FileButtonProps {
  readonly path: string
  readonly label: string
  readonly selected: boolean
  readonly status: ChangeStatus | undefined
  readonly onSelect: (path: string) => void
}

function FileButton({
  path,
  label,
  selected,
  status,
  onSelect,
}: FileButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      className="tree-file"
      data-selected={selected}
      title={path}
      onClick={() => {
        onSelect(path)
      }}
    >
      {status === undefined ? null : (
        <span className="change-status" data-status={status}>
          {status}
        </span>
      )}
      {label}
    </button>
  )
}

interface FolderNodeProps extends FileTreeProps {
  readonly folder: TreeFolder
  readonly toggled: ReadonlySet<string>
  readonly onToggle: (path: string) => void
}

// Only the children of an open folder are rendered, so a 10k-file worktree stays light.
function FolderNode(props: FolderNodeProps): React.JSX.Element {
  const { folder, toggled, onToggle, defaultOpen, statuses, selectedPath, onSelect } = props
  const open = defaultOpen !== toggled.has(folder.path)
  return (
    <li>
      <button
        type="button"
        className="tree-folder"
        aria-expanded={open}
        onClick={() => {
          onToggle(folder.path)
        }}
      >
        {open ? '▾' : '▸'} {folder.name}
      </button>
      {open ? (
        <ul className="tree-list">
          {folder.folders.map((child) => (
            <FolderNode key={child.path} {...props} folder={child} />
          ))}
          {folder.files.map((file) => (
            <li key={file.path}>
              <FileButton
                path={file.path}
                label={file.name}
                selected={file.path === selectedPath}
                status={statuses?.get(file.path)}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function FileTree(props: FileTreeProps): React.JSX.Element {
  const { paths, selectedPath, onSelect, statuses } = props
  const [filter, setFilter] = useState('')
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set())
  const needle = useDebounced(filter.trim().toLowerCase())
  const tree = useMemo(() => buildTree(paths), [paths])
  const matches = useMemo(
    () =>
      needle === ''
        ? []
        : paths.filter((path) => path.toLowerCase().includes(needle)).slice(0, FILTER_LIMIT),
    [paths, needle],
  )

  function toggle(path: string): void {
    const next = new Set(toggled)
    if (!next.delete(path)) {
      next.add(path)
    }
    setToggled(next)
  }

  return (
    <div className="file-tree">
      <input
        type="search"
        className="tree-filter"
        value={filter}
        placeholder={t('Filter files', 'Lọc tệp')}
        aria-label={t('Filter files', 'Lọc tệp')}
        onChange={(event) => {
          setFilter(event.target.value)
        }}
      />
      {needle === '' ? (
        <ul className="tree-list tree-root">
          {tree.folders.map((folder) => (
            <FolderNode
              key={folder.path}
              {...props}
              folder={folder}
              toggled={toggled}
              onToggle={toggle}
            />
          ))}
          {tree.files.map((file) => (
            <li key={file.path}>
              <FileButton
                path={file.path}
                label={file.name}
                selected={file.path === selectedPath}
                status={statuses?.get(file.path)}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="tree-list tree-root">
          {matches.map((path) => (
            <li key={path}>
              <FileButton
                path={path}
                label={path}
                selected={path === selectedPath}
                status={statuses?.get(path)}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
