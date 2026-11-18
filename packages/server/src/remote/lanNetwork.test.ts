import type { NetworkInterfaceInfo } from 'node:os'
import { describe, expect, it } from 'vitest'
import { localIpv4Addresses } from './lanNetwork.js'

function info(address: string, family: 'IPv4' | 'IPv6', internal = false): NetworkInterfaceInfo {
  return {
    address,
    netmask: '255.255.255.0',
    family,
    mac: '00:00:00:00:00:00',
    internal,
    cidr: null,
  } as NetworkInterfaceInfo
}

describe('lanNetwork', () => {
  it('keeps physical IPv4 and skips loopback, vEthernet, link-local and IPv6', () => {
    const addresses = localIpv4Addresses({
      Loopback: [info('127.0.0.1', 'IPv4', true)],
      'vEthernet (WSL)': [info('172.20.0.1', 'IPv4')],
      Ethernet: [info('fe80::1', 'IPv6'), info('192.168.1.5', 'IPv4')],
      'Wi-Fi': [info('169.254.3.4', 'IPv4'), info('10.0.0.7', 'IPv4')],
      Empty: undefined,
    })
    expect(addresses).toEqual(['192.168.1.5', '10.0.0.7'])
  })
})
