import { expect, it } from 'vitest'
import { isInRanges, isIpv4Cidr, parseIpv4 } from './remoteAccess.js'

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
