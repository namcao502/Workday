import { expect, it } from 'vitest'
import { accessFor } from './useMe.js'
import { remoteDevice } from '../testSupport.js'

it('remote access can see and act everywhere', () => {
  const access = accessFor({ mode: 'remote', device: remoteDevice() })
  expect(access.mode).toBe('remote')
  for (const area of ['board', 'timesheet'] as const) {
    expect(access.canSee(area)).toBe(true)
    expect(access.canAct(area)).toBe(true)
  }
})

it('an unpaired device can neither see nor act', () => {
  const access = accessFor({ mode: 'unpaired' })
  expect(access.canSee('board')).toBe(false)
  expect(access.canAct('timesheet')).toBe(false)
})
