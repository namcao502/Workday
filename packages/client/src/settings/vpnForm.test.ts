import { expect, it } from 'vitest'
import { vpnFormOf, vpnFromForm, type VpnForm } from './vpnForm.js'

const FORM: VpnForm = {
  enabled: true,
  address: '10.20.30.40',
  httpsPort: '8443',
  setupPort: '8444',
  allowedRanges: '10.20.0.0/16',
}

it('a blank form saves no vpn', () => {
  expect(vpnFromForm(vpnFormOf(null, []))).toEqual({ vpn: null })
  expect(vpnFormOf(null, ['10.0.0.5'])).toMatchObject({
    address: '10.0.0.5',
    httpsPort: '8443',
    setupPort: '8444',
    enabled: false,
  })
  expect(vpnFromForm({ ...FORM, enabled: false, allowedRanges: '' })).toEqual({
    vpn: {
      enabled: false,
      address: '10.20.30.40',
      httpsPort: 8443,
      setupPort: 8444,
      allowedRanges: [],
    },
  })
})

it('ranges are one per line, trimmed and deduplicated', () => {
  const result = vpnFromForm({
    ...FORM,
    allowedRanges: ' 10.20.0.0/16 \n\n192.168.0.0/24\r\n10.20.0.0/16\n',
  })
  expect(result).toEqual({
    vpn: {
      enabled: true,
      address: '10.20.30.40',
      httpsPort: 8443,
      setupPort: 8444,
      allowedRanges: ['10.20.0.0/16', '192.168.0.0/24'],
    },
  })
})

it('a bad range, a bad port, equal ports or no range while enabled are problems', () => {
  const bad: readonly Partial<VpnForm>[] = [
    { allowedRanges: '10.20.0.0/99' },
    { allowedRanges: '' },
    { address: '10.20.30' },
    { httpsPort: '0' },
    { httpsPort: '8443.5' },
    { setupPort: '70000' },
    { setupPort: '8443' },
  ]
  for (const change of bad) {
    expect(vpnFromForm({ ...FORM, ...change })).toHaveProperty('problem')
  }
})
