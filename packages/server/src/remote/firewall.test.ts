import { describe, expect, it } from 'vitest'
import { FIREWALL_RULE_NAME, firewallCommand, openFirewall } from './firewall.js'

describe('firewall', () => {
  it('builds the rule for both ports and every range', () => {
    expect(firewallCommand([4871, 4872], ['192.168.0.0/16', '10.8.0.0/24'])).toBe(
      `Remove-NetFirewallRule -DisplayName '${FIREWALL_RULE_NAME}' -ErrorAction SilentlyContinue; ` +
        `New-NetFirewallRule -DisplayName '${FIREWALL_RULE_NAME}' -Direction Inbound -Protocol TCP ` +
        '-LocalPort 4871,4872 -RemoteAddress 192.168.0.0/16,10.8.0.0/24 -Profile Any -Action Allow',
    )
  })

  it('rejects a range that is not IPv4 CIDR', () => {
    expect(() => firewallCommand([4871], ['fe80::/10'])).toThrow()
    expect(() => firewallCommand([4871], ["10.0.0.0/8'; calc"])).toThrow()
    expect(() => firewallCommand([4871], [])).toThrow()
    expect(() => firewallCommand([0], ['10.0.0.0/8'])).toThrow()
    expect(() => firewallCommand([70000], ['10.0.0.0/8'])).toThrow()
  })

  it('a cancelled UAC prompt reports firewallCancelled', async () => {
    const result = await openFirewall('x', () =>
      Promise.resolve({ exitCode: 1, stderr: 'The operation was canceled by the user.' }),
    )
    expect(result).toEqual({ ok: false, error: { code: 'firewallCancelled' } })
  })

  it('reports firewallFailed for another failure and ok for exit 0', async () => {
    const failed = await openFirewall('x', () => Promise.resolve({ exitCode: 1, stderr: 'boom' }))
    expect(failed).toEqual({ ok: false, error: { code: 'firewallFailed' } })
    const fine = await openFirewall('x', () => Promise.resolve({ exitCode: 0, stderr: '' }))
    expect(fine).toEqual({ ok: true })
  })

  it('the command reaches PowerShell only as EncodedCommand', async () => {
    const command = firewallCommand([4871], ['10.0.0.0/8'])
    let seen: readonly string[] = []
    await openFirewall(command, (args) => {
      seen = args
      return Promise.resolve({ exitCode: 0, stderr: '' })
    })
    const outer = seen.join(' ')
    expect(outer).not.toContain('New-NetFirewallRule')
    const encoded = /'-EncodedCommand','([A-Za-z0-9+/=]+)'/.exec(outer)?.[1] ?? ''
    const inner = Buffer.from(encoded, 'base64').toString('utf16le')
    expect(inner).toBe(`$ErrorActionPreference = 'Stop'; ${command}`)
    expect(outer).toContain('exit $elevated.ExitCode')
  })
})
