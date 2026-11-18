import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os'

const VIRTUAL_INTERFACE_PREFIX = 'vEthernet' // Hyper-V and WSL adapters
const LINK_LOCAL_PREFIX = '169.254.'

// This PC's usable IPv4 addresses, in interface order (MobileNetwork.cs).
export function localIpv4Addresses(
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): readonly string[] {
  const addresses: string[] = []
  for (const [name, entries] of Object.entries(interfaces)) {
    if (name.startsWith(VIRTUAL_INTERFACE_PREFIX) || entries === undefined) {
      continue
    }
    for (const entry of entries) {
      if (
        entry.family === 'IPv4' &&
        !entry.internal &&
        !entry.address.startsWith(LINK_LOCAL_PREFIX)
      ) {
        addresses.push(entry.address)
      }
    }
  }
  return addresses
}
