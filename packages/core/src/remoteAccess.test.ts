import { expect, it } from 'vitest'
import {
  DEFAULT_DEVICE_RIGHTS,
  allows,
  isInRanges,
  isIpv4Cidr,
  parseIpv4,
  parseRights,
  type DeviceRights,
} from './remoteAccess.js'

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

it('parseIpv4 accepts a dotted quad and rejects out-of-range or padded parts', () => {
  expect(parseIpv4('10.20.30.40')).toBe(((10 << 24) | (20 << 16) | (30 << 8) | 40) >>> 0)
  expect(parseIpv4('255.255.255.255')).toBe(4294967295)
  expect(parseIpv4('0.0.0.0')).toBe(0)
  expect(parseIpv4('256.1.1.1')).toBeNull()
  expect(parseIpv4('010.1.1.1')).toBeNull()
  expect(parseIpv4('1.2.3')).toBeNull()
  expect(parseIpv4('1.2.3.4.5')).toBeNull()
  expect(parseIpv4('1.2.3.x')).toBeNull()
  expect(parseIpv4('')).toBeNull()
})

it('isIpv4Cidr accepts 10.0.0.0/8 and rejects a host name, an IPv6 range and /33', () => {
  expect(isIpv4Cidr('10.0.0.0/8')).toBe(true)
  expect(isIpv4Cidr('0.0.0.0/0')).toBe(true)
  expect(isIpv4Cidr('vpn.example.com/8')).toBe(false)
  expect(isIpv4Cidr('fd00::/8')).toBe(false)
  expect(isIpv4Cidr('10.0.0.0/33')).toBe(false)
  expect(isIpv4Cidr('10.0.0.0')).toBe(false)
})

it('isInRanges matches inside the range, an IPv4-mapped address, and nothing for an empty list', () => {
  expect(isInRanges('10.20.5.6', ['10.20.0.0/16'])).toBe(true)
  expect(isInRanges('10.21.5.6', ['10.20.0.0/16'])).toBe(false)
  expect(isInRanges('::ffff:10.20.5.6', ['10.20.0.0/16'])).toBe(true)
  expect(isInRanges('10.20.5.6', [])).toBe(false)
  expect(isInRanges('200.1.1.1', ['bad', '0.0.0.0/0'])).toBe(true)
  expect(isInRanges('200.1.1.1', ['bad'])).toBe(false)
  expect(isInRanges('::1', ['0.0.0.0/0'])).toBe(false)
})
