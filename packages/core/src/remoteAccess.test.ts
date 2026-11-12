import { expect, it } from 'vitest'
import { DEFAULT_DEVICE_RIGHTS, allows, parseRights, type DeviceRights } from './remoteAccess.js'

const RIGHTS: DeviceRights = { board: 'view', timesheet: 'act' }

it('allows grants view to act and nothing to off', () => {
  expect(allows(RIGHTS, 'timesheet', 'view')).toBe(true)
  expect(allows(RIGHTS, 'timesheet', 'act')).toBe(true)
  expect(allows(RIGHTS, 'board', 'view')).toBe(true)
  expect(allows(RIGHTS, 'board', 'act')).toBe(false)
  expect(allows({ board: 'off', timesheet: 'off' }, 'board', 'view')).toBe(false)
})

it('parseRights drops unknown areas and turns a missing one off', () => {
  expect(parseRights({ board: 'act', mystery: 'act' })).toEqual({ board: 'act', timesheet: 'off' })
  expect(parseRights({ board: 'root', timesheet: 3 })).toEqual({ board: 'off', timesheet: 'off' })
  expect(parseRights(null)).toEqual({ board: 'off', timesheet: 'off' })
})

it('a new device gets Tickets view and Timesheet act', () => {
  expect(DEFAULT_DEVICE_RIGHTS).toEqual({ board: 'view', timesheet: 'act' })
})
