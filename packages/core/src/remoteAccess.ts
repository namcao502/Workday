const IPV4_PART = /^(?:0|[1-9]\d{0,2})$/
const MAPPED_PREFIX = '::ffff:'

// Canonical dotted quad only (no padding, no short forms); the value is an unsigned 32-bit number.
export function parseIpv4(text: string): number | null {
  const parts = text.split('.')
  if (parts.length !== 4) {
    return null
  }
  let value = 0
  for (const part of parts) {
    if (!IPV4_PART.test(part) || Number(part) > 255) {
      return null
    }
    value = value * 256 + Number(part)
  }
  return value
}

function parseCidr(range: string): { readonly base: number; readonly mask: number } | null {
  const [ip, bits, ...rest] = range.split('/')
  if (ip === undefined || bits === undefined || rest.length !== 0 || !/^\d{1,2}$/.test(bits)) {
    return null
  }
  const base = parseIpv4(ip)
  const length = Number(bits)
  if (base === null || length > 32) {
    return null
  }
  // A shift by 32 wraps in JS, so /0 is its own case.
  return { base, mask: length === 0 ? 0 : (0xffffffff << (32 - length)) >>> 0 }
}

export function isIpv4Cidr(range: string): boolean {
  return parseCidr(range) !== null
}

// An IPv4-mapped IPv6 address counts as its IPv4 part; malformed ranges never match.
export function isInRanges(address: string, ranges: readonly string[]): boolean {
  const plain = address.toLowerCase().startsWith(MAPPED_PREFIX)
    ? address.slice(MAPPED_PREFIX.length)
    : address
  const value = parseIpv4(plain)
  if (value === null) {
    return false
  }
  return ranges.some((range) => {
    const cidr = parseCidr(range)
    return cidr !== null && (value & cidr.mask) >>> 0 === (cidr.base & cidr.mask) >>> 0
  })
}
