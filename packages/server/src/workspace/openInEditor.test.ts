import { describe, expect, it } from 'vitest'
import { openInVsCode, vsCodeCommand } from './openInEditor.js'

const SOURCE = { PATH: 'p', CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', KEEP: 'yes' }

describe('vsCodeCommand', () => {
  it('on Windows passes the target through a variable to cmd.exe', () => {
    const command = vsCodeCommand('C:\\a b\\c', true, SOURCE)
    expect(command.file).toBe('cmd.exe')
    expect(command.args).toEqual(['/c', 'code', '"%WORKDAY_VSCODE_TARGET%"'])
    expect(command.env['WORKDAY_VSCODE_TARGET']).toBe('C:\\a b\\c')
  })

  it('elsewhere runs code with the target as one argument, no shell', () => {
    const command = vsCodeCommand('/a b/c', false, SOURCE)
    expect(command).toMatchObject({ file: 'code', args: ['/a b/c'] })
  })

  it('drops Claude session variables and keeps the rest', () => {
    const { env } = vsCodeCommand('/x', false, SOURCE)
    expect(env).toEqual({ PATH: 'p', KEEP: 'yes' })
  })
})

describe('openInVsCode', () => {
  it('logs a spawn failure and returns false', async () => {
    const logged: string[] = []
    const ok = await openInVsCode('/x', {
      isWindows: false,
      environment: {},
      spawn: () => Promise.reject(new Error('ENOENT')),
      logError: (message) => logged.push(message),
    })
    expect(ok).toBe(false)
    expect(logged).toHaveLength(1)
  })
})
