import { describe, expect, it } from 'vitest'
import { makeNwcred } from '../testing/nwcredFixture.js'
import { NwcredError, openNwcred } from './nwcred.js'

function codeOf(run: () => unknown): string | null {
  try {
    run()
    return null
  } catch (error) {
    return error instanceof NwcredError ? error.code : 'other'
  }
}

describe('openNwcred', () => {
  it('decrypts an export made with the C# parameters', () => {
    const text = makeNwcred({ JIRA_API_TOKEN: 'tok-1', HRM_API_KEY: 'hrm-1' }, 'pa55')

    expect(openNwcred(text, 'pa55')).toEqual({ JIRA_API_TOKEN: 'tok-1', HRM_API_KEY: 'hrm-1' })
  })

  it('accepts a BOM before the JSON', () => {
    const text = '\uFEFF' + makeNwcred({ A: 'b' }, 'pw')

    expect(openNwcred(text, 'pw')).toEqual({ A: 'b' })
  })

  it('throws wrongPassword for a wrong password, without the content', () => {
    const text = makeNwcred({ JIRA_API_TOKEN: 'tok-1' }, 'right')

    expect(codeOf(() => openNwcred(text, 'Hunter2x'))).toBe('wrongPassword')
    try {
      openNwcred(text, 'Hunter2x')
    } catch (error) {
      expect(String(error)).not.toContain('tok-1')
      expect(String(error)).not.toContain('Hunter2x')
    }
  })

  it('throws notAnExport for other JSON, bad base64 sizes or no JSON', () => {
    const good = JSON.parse(makeNwcred({ A: 'b' }, 'pw')) as Record<string, unknown>

    expect(codeOf(() => openNwcred('not json', 'pw'))).toBe('notAnExport')
    expect(codeOf(() => openNwcred(JSON.stringify({ ...good, Format: 'x' }), 'pw'))).toBe(
      'notAnExport',
    )
    expect(codeOf(() => openNwcred(JSON.stringify({ ...good, Version: 2 }), 'pw'))).toBe(
      'notAnExport',
    )
    expect(codeOf(() => openNwcred(JSON.stringify({ ...good, Nonce: 'AAAA' }), 'pw'))).toBe(
      'notAnExport',
    )
    expect(codeOf(() => openNwcred(JSON.stringify({ ...good, Iterations: 0 }), 'pw'))).toBe(
      'notAnExport',
    )
  })
})
