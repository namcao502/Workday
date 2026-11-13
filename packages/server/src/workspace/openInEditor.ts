import { spawn } from 'node:child_process'
import { isClaudeSessionVariable } from '@workday/core'

export interface EditorCommand {
  readonly file: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
}

export type SpawnEditor = (command: EditorCommand) => Promise<void>

const TARGET_VARIABLE = 'WORKDAY_VSCODE_TARGET'

// `code` is a batch shim, so Windows goes through cmd.exe; the path rides in a variable
// because cmd expands %NAME% on its line.
export function vsCodeCommand(
  target: string,
  isWindows: boolean,
  source: Readonly<Record<string, string | undefined>>,
): EditorCommand {
  const kept = Object.entries(source).filter(
    (entry): entry is [string, string] =>
      entry[1] !== undefined && !isClaudeSessionVariable(entry[0]),
  )
  const env = Object.fromEntries(kept)
  if (isWindows) {
    return {
      file: 'cmd.exe',
      args: ['/c', 'code', `"%${TARGET_VARIABLE}%"`],
      env: { ...env, [TARGET_VARIABLE]: target },
    }
  }
  return { file: 'code', args: [target], env }
}

export const spawnEditor: SpawnEditor = (command) =>
  new Promise((resolve, reject) => {
    const child = spawn(command.file, [...command.args], {
      env: { ...command.env },
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
      windowsVerbatimArguments: true,
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })

// A failed spawn is logged and reported as false; the caller never sees the error.
export async function openInVsCode(
  target: string,
  deps: {
    readonly isWindows: boolean
    readonly environment: Readonly<Record<string, string | undefined>>
    readonly spawn: SpawnEditor
    readonly logError: (message: string, error: unknown) => void
  },
): Promise<boolean> {
  try {
    await deps.spawn(vsCodeCommand(target, deps.isWindows, deps.environment))
    return true
  } catch (error: unknown) {
    deps.logError('Opening VS Code failed', error)
    return false
  }
}
