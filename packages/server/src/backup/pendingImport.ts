import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const PENDING_FOLDER = 'import-pending'

function stamp(now: Date): string {
  const iso = now.toISOString()
  return `${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 19).replaceAll(':', '')}`
}

// Replaces any older pending folder; the files install at the next start.
export async function stageImport(
  dataDir: string,
  files: ReadonlyMap<string, Buffer>,
): Promise<void> {
  const pending = join(dataDir, PENDING_FOLDER)
  await rm(pending, { recursive: true, force: true })
  await mkdir(pending, { recursive: true })
  for (const [name, content] of files) {
    await writeFile(join(pending, name), content)
  }
}

// Runs before any service reads the data dir: old files go to before-import-<stamp>/.
export function applyPendingImport(
  dataDir: string,
  now: Date,
  log: (message: string) => void,
): void {
  const pending = join(dataDir, PENDING_FOLDER)
  if (!existsSync(pending)) {
    return
  }
  const aside = join(dataDir, `before-import-${stamp(now)}`)
  const names = readdirSync(pending)
  for (const name of names) {
    const current = join(dataDir, name)
    if (existsSync(current)) {
      mkdirSync(aside, { recursive: true })
      renameSync(current, join(aside, name))
    }
    renameSync(join(pending, name), current)
  }
  rmSync(pending, { recursive: true, force: true })
  log(`Imported ${String(names.length)} file(s) from the backup`)
}
