import { describe, expect, it } from 'vitest'
import manifestText from '../public/manifest.webmanifest?raw'
import { DEFAULT_PAGE, pageFromHash } from './shell/pages.js'

interface Shortcut {
  readonly name: string
  readonly url: string
  readonly icons: readonly { readonly src: string; readonly sizes: string }[]
}

interface Manifest {
  readonly id: string
  readonly shortcuts: readonly Shortcut[]
}

const manifest = JSON.parse(manifestText) as Manifest

describe('manifest', () => {
  it('the manifest shortcuts point at known pages', () => {
    const hashes = manifest.shortcuts.map((shortcut) => new URL(shortcut.url, 'http://x').hash)

    expect(hashes).toEqual(['#/tickets', '#/workspace', '#/timesheet'])
    for (const hash of hashes) {
      const page = pageFromHash(hash)
      expect(page === DEFAULT_PAGE ? hash === '#/tickets' : true).toBe(true)
    }
  })

  it('every shortcut has a name and a 192 icon, and the app has an id', () => {
    expect(manifest.id).toBe('/')
    for (const shortcut of manifest.shortcuts) {
      expect(shortcut.name).not.toBe('')
      expect(shortcut.icons.map((icon) => icon.sizes)).toContain('192x192')
    }
  })
})
