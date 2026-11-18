import { expect, it } from 'vitest'
import { leadChip } from './teamsComposerDom.js'

const LEAD = { mri: '8:orgid:minh', displayName: 'Minh Dinh (DU2 - Tech Leader)' }

it('turns the greeted lead into a real mention chip', () => {
  const loaded = leadChip('<p>a Minh Dinh (DU2 - Tech Leader), da e update</p>', LEAD)
  expect(loaded.mentions).toEqual([
    { text: 'Minh Dinh', mri: '8:orgid:minh', displayName: 'Minh Dinh (DU2 - Tech Leader)' },
  ])
  expect(loaded.html).toBe(
    '<p>a <span data-mention="0" contenteditable="false" class="teams-mention">Minh Dinh</span>, da e update</p>',
  )
})

it('leaves the draft alone without a lead or when the name is not in it', () => {
  expect(leadChip('<p>hi</p>', null)).toEqual({ html: '<p>hi</p>', mentions: [] })
  expect(leadChip('<p>hi</p>', LEAD)).toEqual({ html: '<p>hi</p>', mentions: [] })
})
