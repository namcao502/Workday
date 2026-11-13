import { execFile } from 'node:child_process'

export interface GitResult {
  readonly ok: boolean
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number | null // null: never ran or killed
  readonly timedOut: boolean
}

const MAX_OUTPUT_BYTES = 16 * 1024 * 1024

// No shell. Reads pass --no-optional-locks; executable is only for tests of the timeout.
export function runGit(
  cwd: string,
  args: readonly string[],
  timeoutMs: number,
  executable = 'git',
): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      executable,
      [...args],
      {
        cwd,
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ ok: true, stdout, stderr, exitCode: 0, timedOut: false })
          return
        }
        const timedOut = 'killed' in error && error.killed
        const exitCode = typeof error.code === 'number' ? error.code : null
        resolve({
          ok: false,
          stdout,
          stderr: stderr === '' ? error.message : stderr,
          exitCode,
          timedOut,
        })
      },
    )
  })
}
