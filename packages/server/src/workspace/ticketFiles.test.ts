import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  imageMimeType,
  listDocs,
  listWorktree,
  PathOutsideError,
  readTicketFile,
  resolveInside,
} from './ticketFiles.js'

function temp(): string {
  return mkdtempSync(join(tmpdir(), 'workday-files-'))
}

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' })
}

describe('listDocs', () => {
  it('lists files recursively with / and case-insensitive order', async () => {
    const root = temp()
    mkdirSync(join(root, 'sub'))
    writeFileSync(join(root, 'b.md'), 'x')
    writeFileSync(join(root, 'A.md'), 'x')
    writeFileSync(join(root, 'sub', 'c.md'), 'x')
    expect(await listDocs(root)).toEqual(['A.md', 'b.md', 'sub/c.md'])
  })

  it('is null for a missing folder', async () => {
    expect(await listDocs(join(temp(), 'nope'))).toBeNull()
  })
})

describe('listWorktree', () => {
  it('lists tracked and untracked files, minus deleted ones and nested repos', async () => {
    const root = temp()
    git(root, 'init', '-b', 'main')
    writeFileSync(join(root, 'kept.txt'), 'x')
    writeFileSync(join(root, 'gone.txt'), 'x')
    git(root, 'add', '.')
    git(root, '-c', 'user.email=t@e.x', '-c', 'user.name=T', 'commit', '-m', 'one')
    execFileSync(process.execPath, ['-e', "require('fs').unlinkSync('gone.txt')"], { cwd: root })
    writeFileSync(join(root, 'new.txt'), 'x')
    mkdirSync(join(root, 'nested'))
    git(join(root, 'nested'), 'init', '-b', 'main')
    writeFileSync(join(root, 'nested', 'f.txt'), 'x')
    expect(await listWorktree(root)).toEqual(['kept.txt', 'new.txt'])
  })

  it('is null outside a repository', async () => {
    expect(await listWorktree(temp())).toBeNull()
  })
})

describe('readTicketFile', () => {
  it('reads text, markdown, image, binary and oversized files', async () => {
    const root = temp()
    writeFileSync(join(root, 'a.txt'), 'hello')
    writeFileSync(join(root, 'b.MD'), '# hi')
    writeFileSync(join(root, 'c.png'), Buffer.from([1, 2, 3]))
    writeFileSync(join(root, 'd.bin'), Buffer.from([97, 0, 98]))
    writeFileSync(join(root, 'e.txt'), 'x'.repeat((1 << 20) + 1))
    expect(await readTicketFile(join(root, 'a.txt'))).toEqual({ kind: 'text', text: 'hello' })
    expect(await readTicketFile(join(root, 'b.MD'))).toEqual({ kind: 'markdown', text: '# hi' })
    expect(await readTicketFile(join(root, 'c.png'))).toEqual({ kind: 'image' })
    expect(await readTicketFile(join(root, 'd.bin'))).toEqual({ kind: 'binary' })
    expect(await readTicketFile(join(root, 'e.txt'))).toEqual({ kind: 'tooLarge' })
  })

  it('knows image types by extension', () => {
    expect(imageMimeType('x.JPG')).toBe('image/jpeg')
    expect(imageMimeType('x.txt')).toBeNull()
  })
})

describe('resolveInside', () => {
  it('accepts a file inside the root, existing or not', async () => {
    const root = temp()
    writeFileSync(join(root, 'a.txt'), 'x')
    expect(await resolveInside(root, 'a.txt')).toBe(join(root, 'a.txt'))
    expect(await resolveInside(root, 'missing/b.txt')).toBe(join(root, 'missing', 'b.txt'))
  })

  it.each(['', '../x', 'a/../../x', '/etc/passwd', 'C:\\Windows\\x', 'a\0b', '..\\x'])(
    'refuses %j',
    async (relative) => {
      await expect(resolveInside(temp(), relative)).rejects.toBeInstanceOf(PathOutsideError)
    },
  )

  it('refuses a link that leads outside the root', async () => {
    const root = temp()
    const outside = temp()
    writeFileSync(join(outside, 'secret.txt'), 'x')
    symlinkSync(outside, join(root, 'link'), 'junction')
    await expect(resolveInside(root, 'link/secret.txt')).rejects.toBeInstanceOf(PathOutsideError)
  })
})
