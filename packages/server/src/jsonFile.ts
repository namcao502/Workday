import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function keepAsBad(path: string): void {
  try {
    rmSync(`${path}.bad`, { force: true })
    renameSync(path, `${path}.bad`)
  } catch {
    // A file that cannot be moved aside is left alone; startup still continues with the default.
  }
}

// Never throws: a missing file gives the default; a corrupt or wrong-shaped one is kept as <file>.bad.
export function readJson<Value>(
  path: string,
  parse: (raw: unknown) => Value | null,
  defaultValue: Value,
): Value {
  if (!existsSync(path)) {
    return defaultValue
  }
  try {
    const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
    const parsed = parse(raw)
    if (parsed !== null) {
      return parsed
    }
  } catch {
    // Unreadable or not JSON: handled like a wrong shape below.
  }
  console.warn(`Ignoring ${path}: it is not valid; kept as ${path}.bad`)
  keepAsBad(path)
  return defaultValue
}

export async function writeJsonAtomic(path: string, value: unknown, mode?: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.tmp`
  await writeFile(temporaryPath, JSON.stringify(value, null, 2), { mode })
  await rename(temporaryPath, path)
}
