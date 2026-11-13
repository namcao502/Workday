import { spawn } from 'node-pty'
import type { SpawnPty } from './pty.js'

// The real PTY; tests use testing/fakePty.ts and never start a shell.
export const spawnNodePty: SpawnPty = (launch, options) => {
  const pty = spawn(launch.file, [...launch.args], {
    name: 'xterm-256color',
    cwd: options.cwd,
    cols: options.columns,
    rows: options.rows,
    env: { ...options.env },
  })
  return {
    onData: (listener) => {
      pty.onData(listener)
    },
    onExit: (listener) => {
      pty.onExit(({ exitCode }) => {
        listener(exitCode)
      })
    },
    write: (data) => {
      pty.write(data)
    },
    resize: (columns, rows) => {
      pty.resize(columns, rows)
    },
    kill: () => {
      pty.kill()
    },
  }
}
