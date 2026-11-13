export interface TreeFile {
  readonly name: string
  readonly path: string
}

export interface TreeFolder {
  readonly name: string
  readonly path: string
  readonly folders: readonly TreeFolder[]
  readonly files: readonly TreeFile[]
}

interface MutableFolder {
  readonly name: string
  readonly path: string
  readonly folders: Map<string, MutableFolder>
  readonly files: TreeFile[]
}

function compareNames(a: string, b: string): number {
  return a.toLowerCase().localeCompare(b.toLowerCase()) || (a < b ? -1 : a > b ? 1 : 0)
}

function freeze(folder: MutableFolder, isRoot: boolean): TreeFolder {
  const folders = [...folder.folders.values()]
    .map((child) => freeze(child, false))
    .sort((a, b) => compareNames(a.name, b.name))
  const files = [...folder.files].sort((a, b) => compareNames(a.name, b.name))
  const only = folders[0]
  if (!isRoot && folders.length === 1 && files.length === 0 && only !== undefined) {
    return { ...only, name: `${folder.name}/${only.name}` }
  }
  return { name: folder.name, path: folder.path, folders, files }
}

// Folders first, case-insensitive; a folder with one folder and no files merges into "a/b".
export function buildTree(paths: readonly string[]): TreeFolder {
  const root: MutableFolder = { name: '', path: '', folders: new Map(), files: [] }
  for (const path of paths) {
    const parts = path.split('/')
    const fileName = parts.pop() ?? path
    let current = root
    for (const part of parts) {
      let next = current.folders.get(part)
      if (next === undefined) {
        const childPath = current.path === '' ? part : `${current.path}/${part}`
        next = { name: part, path: childPath, folders: new Map(), files: [] }
        current.folders.set(part, next)
      }
      current = next
    }
    current.files.push({ name: fileName, path })
  }
  return freeze(root, true)
}

// File paths in the order the tree shows them, folders first.
export function treeOrder(folder: TreeFolder): readonly string[] {
  return [...folder.folders.flatMap(treeOrder), ...folder.files.map((file) => file.path)]
}
