import { expect, it } from 'vitest'
import { buildTree, treeOrder } from './buildTree.js'

it('lists folders before files and sorts case-insensitively', () => {
  const tree = buildTree(['b.txt', 'A.txt', 'zeta/x.ts', 'Alpha/y.ts', 'zeta/w.ts'])
  expect(tree.folders.map((folder) => folder.name)).toEqual(['Alpha', 'zeta'])
  expect(tree.files.map((file) => file.name)).toEqual(['A.txt', 'b.txt'])
  expect(tree.folders[1]?.files.map((file) => file.path)).toEqual(['zeta/w.ts', 'zeta/x.ts'])
})

it('merges a folder that holds only one folder', () => {
  const tree = buildTree(['src/app/main.ts', 'src/app/util/a.ts', 'docs/readme.md'])
  const merged = tree.folders.find((folder) => folder.name === 'src/app')
  expect(merged?.path).toBe('src/app')
  expect(merged?.files.map((file) => file.name)).toEqual(['main.ts'])
  expect(merged?.folders.map((folder) => folder.name)).toEqual(['util'])
})

it('keeps a folder with files unmerged', () => {
  const tree = buildTree(['src/index.ts', 'src/app/a.ts'])
  expect(tree.folders.map((folder) => folder.name)).toEqual(['src'])
  expect(tree.folders[0]?.folders[0]?.name).toBe('app')
})

it('lists paths in tree order', () => {
  expect(treeOrder(buildTree(['b.txt', 'z/a.ts', 'a/b.ts']))).toEqual(['a/b.ts', 'z/a.ts', 'b.txt'])
})
