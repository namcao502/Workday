import { isIpv4Cidr, parseIpv4, type VpnConfig } from '@workday/core'
import { t } from '../i18n.js'

export interface VpnForm {
  readonly enabled: boolean
  readonly address: string
  readonly httpsPort: string
  readonly setupPort: string
  readonly allowedRanges: string // one CIDR per line
}

const DEFAULT_HTTPS_PORT = 8443
const DEFAULT_SETUP_PORT = 8444
const MAX_PORT = 65535

export function vpnFormOf(vpn: VpnConfig | null, addresses: readonly string[]): VpnForm {
  if (vpn === null) {
    return {
      enabled: false,
      address: addresses[0] ?? '',
      httpsPort: String(DEFAULT_HTTPS_PORT),
      setupPort: String(DEFAULT_SETUP_PORT),
      allowedRanges: '',
    }
  }
  return {
    enabled: vpn.enabled,
    address: vpn.address,
    httpsPort: String(vpn.httpsPort),
    setupPort: String(vpn.setupPort),
    allowedRanges: vpn.allowedRanges.join('\n'),
  }
}

function parsePort(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) {
    return null
  }
  const port = Number(trimmed)
  return port >= 1 && port <= MAX_PORT ? port : null
}

function rangesOf(text: string): readonly string[] {
  const lines = text.split('\n').map((line) => line.trim())
  return [...new Set(lines.filter((line) => line !== ''))]
}

// A blank, switched-off form is "not configured" (null); anything else is validated and saved.
export function vpnFromForm(
  form: VpnForm,
): { readonly vpn: VpnConfig | null } | { readonly problem: string } {
  const address = form.address.trim()
  if (!form.enabled && address === '') {
    return { vpn: null }
  }
  if (parseIpv4(address) === null) {
    return {
      problem: t('settings.theVpnAddressIsNotA'),
    }
  }
  const httpsPort = parsePort(form.httpsPort)
  const setupPort = parsePort(form.setupPort)
  if (httpsPort === null || setupPort === null) {
    return {
      problem: t('settings.portsMustBeWholeNumbersFrom'),
    }
  }
  if (httpsPort === setupPort) {
    return { problem: t('settings.theTwoPortsMustDiffer') }
  }
  const allowedRanges = rangesOf(form.allowedRanges)
  const badRange = allowedRanges.find((range) => !isIpv4Cidr(range))
  if (badRange !== undefined) {
    return {
      problem: t('settings.notAValidIpv4Range', { badRange }),
    }
  }
  if (form.enabled && allowedRanges.length === 0) {
    return {
      problem: t('settings.addAtLeastOneAllowedIp'),
    }
  }
  return { vpn: { enabled: form.enabled, address, httpsPort, setupPort, allowedRanges } }
}
