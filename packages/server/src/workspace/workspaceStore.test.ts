import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { EMPTY_WORKSPACE, loadWorkspace, saveWorkspace } from './workspaceStore.js'

function dataDirWith(content: string): string {
  const dataDir = mkdtempSync(join(tmpdir(), 'workday-ws-'))
  writeFileSync(join(dataDir, 'workspace.json'), content)
  return dataDir
}

describe('workspaceStore', () => {
  it('drops tabs with a bad id and sessions that do not belong to their tab', () => {
    const dataDir = dataDirWith(
      JSON.stringify({
        tabs: [
          {
            id: 'ABC-1',
            kind: 'ticket',
            folder: null,
            sessions: ['ABC-1', 'ABC-1~2', 'XYZ-9', 'ABC-1~x'],
          },
          { id: 'claude2', kind: 'terminal', folder: 'C:\\work', sessions: ['claude2'] },
          { id: '../evil', kind: 'terminal', folder: null, sessions: ['../evil'] },
          { id: 'claude', kind: 'terminal', folder: 5, sessions: ['claude'] },
          'junk',
        ],
        sessionIds: {
          'ABC-1|C:\\w': '0f8fad5b-d9cb-469f-a165-70867728950e',
          bad: 3,
          noBar: '0f8fad5b-d9cb-469f-a165-70867728950e',
          'claude|C:\\x': 'not-a-guid',
        },
        recentFolders: ['a', 'b', 'c', 'd', 'e', 'f', 7],
      }),
    )
    const state = loadWorkspace(dataDir)
    expect(state.tabs).toEqual([
      { id: 'ABC-1', kind: 'ticket', folder: null, sessions: ['ABC-1', 'ABC-1~2'] },
      { id: 'claude2', kind: 'terminal', folder: 'C:\\work', sessions: ['claude2'] },
    ])
    expect(state.sessionIds).toEqual({ 'ABC-1|C:\\w': '0f8fad5b-d9cb-469f-a165-70867728950e' })
    expect(state.recentFolders).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('a corrupt file is kept as .bad and loads empty', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const dataDir = dataDirWith('{not json')
    expect(loadWorkspace(dataDir)).toEqual(EMPTY_WORKSPACE)
    expect(existsSync(join(dataDir, 'workspace.json.bad'))).toBe(true)
  })

  it('saves and loads back', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'workday-ws-'))
    const state = {
      tabs: [
        { id: 'claude', kind: 'terminal' as const, folder: null, sessions: ['claude', 'claude~3'] },
      ],
      sessionIds: {},
      recentFolders: ['C:\\x'],
    }
    await saveWorkspace(dataDir, state)
    expect(loadWorkspace(dataDir)).toEqual(state)
  })
})
