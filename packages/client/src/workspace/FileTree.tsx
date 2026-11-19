import type { ChangeStatus } from '@workday/core'
import { SearchField } from '@heroui/react'
import { ChevronDown, ChevronRight } from '@gravity-ui/icons'
import { useEffect, useMemo, useState } from 'react'
import { t } from '../i18n.js'
import { buildTree, type TreeFolder } from './buildTree.js'
import { Tip } from '../ui/Tip.js'

const FILTER_DELAY_MS = 150
const FILTER_LIMIT = 500
const ROW_CLASS =
  'flex min-h-8 w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm leading-snug hover:bg-surface-secondary'
const STATUS_COLOR: Record<ChangeStatus, string> = {
  A: 'text-success',
  M: 'text-warning',
  D: 'text-danger',
}

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
    <Tip className="block" content={path}>
      <button
        type="button"
        className={`${ROW_CLASS}${selected ? ' bg-accent-soft text-accent-soft-foreground' : ''}`}
        onClick={() => {
          onSelect(path)
        }}
      >
        {status === undefined ? null : (
          <span className={`w-4 shrink-0 font-mono font-semibold ${STATUS_COLOR[status]}`}>
            {status}
          </span>
        )}
        <span className="min-w-0 truncate">{label}</span>
      </button>
    </Tip>
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
        className={ROW_CLASS}
        aria-expanded={open}
        onClick={() => {
          onToggle(folder.path)
        }}
      >
        {open ? <ChevronDown className="shrink-0" /> : <ChevronRight className="shrink-0" />}
        <Tip className="block min-w-0 truncate" content={folder.path}>
          {folder.name}
        </Tip>
      </button>
      {open ? (
        <ul className="flex list-none flex-col gap-0.5 pl-3.5">
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
    <div className="flex flex-col gap-1">
      <SearchField
        fullWidth
        aria-label={t('workspace.filterFiles')}
        value={filter}
        onChange={setFilter}
      >
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder={t('workspace.filterFiles')} />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>
      {needle === '' ? (
        <ul className="flex list-none flex-col gap-0.5 pl-0">
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
        <ul className="flex list-none flex-col gap-0.5 pl-0">
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
