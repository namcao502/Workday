import { expect, it } from 'vitest'
import { parseShortstat } from './gitStatus.js'

it('sums insertions and deletions from a shortstat line', () => {
  expect(parseShortstat(' 3 files changed, 947 insertions(+), 117 deletions(-)\n')).toEqual({
    added: 947,
    removed: 117,
  })
  expect(parseShortstat(' 1 file changed, 1 insertion(+)\n')).toEqual({ added: 1, removed: 0 })
  expect(parseShortstat('')).toEqual({ added: 0, removed: 0 })
})
