import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import type { LanTls } from './lanCertificates.js'
import { SetupServer, type SetupServerOptions } from './setupServer.js'

const CA_DER = Buffer.from([1, 2, 3, 4, 5])
const TLS: LanTls = {
  key: 'key',
  cert: 'cert',
  caDer: CA_DER,
  caFingerprint: 'AB:CD:EF',
  renewed: false,
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => {
        resolve(port)
      })
    })
  })
}

async function options(overrides: Partial<SetupServerOptions> = {}): Promise<SetupServerOptions> {
  return {
    address: '127.0.0.1',
    port: await freePort(),
    httpsUrl: 'https://192.168.1.5:4871',
    allowedRanges: ['127.0.0.0/8'],
    tls: () => Promise.resolve(TLS),
    language: () => 'en',
    ...overrides,
  }
}

describe('SetupServer', () => {
  const servers: SetupServer[] = []
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()))
  })

  function newServer(): SetupServer {
    const server = new SetupServer()
    servers.push(server)
    return server
  }

  it('serves the CA and the setup page while open', async () => {
    const server = newServer()
    const opened = await options()
    await server.open(opened)
    expect(server.isOpen).toBe(true)
    const base = `http://127.0.0.1:${String(opened.port)}`

    const page = await fetch(`${base}/setup`)
    const html = await page.text()
    expect(page.status).toBe(200)
    expect(page.headers.get('content-type')).toContain('text/html; charset=utf-8')
    expect(page.headers.get('cache-control')).toBe('no-store')
    expect(page.headers.get('content-security-policy')).toBe(
      "default-src 'none'; style-src 'unsafe-inline'",
    )
    expect(html).toContain('href="/ca.cer"')
    expect(html).toContain('https://192.168.1.5:4871')
    expect(html).toContain('AB:CD:EF')
    expect(html).toContain('Certificate Trust Settings')

    const ca = await fetch(`${base}/ca.cer`)
    expect(ca.status).toBe(200)
    expect(ca.headers.get('content-type')).toBe('application/x-x509-ca-cert')
    expect(Buffer.from(await ca.arrayBuffer()).equals(CA_DER)).toBe(true)
  })

  it('writes the page in Vietnamese when the language is vi', async () => {
    const server = newServer()
    const opened = await options({ language: () => 'vi' })
    await server.open(opened)
    const html = await (await fetch(`http://127.0.0.1:${String(opened.port)}/setup`)).text()
    expect(html).toContain('Cài đặt tin cậy chứng nhận')
  })

  it('refuses an address outside the allowed ranges', async () => {
    const server = newServer()
    const opened = await options({ allowedRanges: ['10.0.0.0/8'] })
    await server.open(opened)
    const base = `http://127.0.0.1:${String(opened.port)}`
    expect((await fetch(`${base}/setup`)).status).toBe(403)
    expect((await fetch(`${base}/ca.cer`)).status).toBe(403)
  })

  it('answers 404 for any other path', async () => {
    const server = newServer()
    const opened = await options()
    await server.open(opened)
    const base = `http://127.0.0.1:${String(opened.port)}`
    expect((await fetch(`${base}/`)).status).toBe(404)
    expect((await fetch(`${base}/api/state`)).status).toBe(404)
  })

  it('escapes the values in the page', async () => {
    const server = newServer()
    const opened = await options({
      httpsUrl: 'https://x/"><script>alert(1)</script>',
      tls: () => Promise.resolve({ ...TLS, caFingerprint: '<b>&' }),
    })
    await server.open(opened)
    const html = await (await fetch(`http://127.0.0.1:${String(opened.port)}/setup`)).text()
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>&')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;b&gt;&amp;')
  })

  it('close stops listening', async () => {
    const server = newServer()
    const opened = await options()
    await server.open(opened)
    await server.close()
    expect(server.isOpen).toBe(false)
    await expect(fetch(`http://127.0.0.1:${String(opened.port)}/setup`)).rejects.toThrow()
  })

  it('open with the same options does nothing and with new ones reopens', async () => {
    const server = newServer()
    const first = await options()
    await server.open(first)
    await server.open({ ...first })
    expect((await fetch(`http://127.0.0.1:${String(first.port)}/setup`)).status).toBe(200)
    const second = await options()
    await server.open(second)
    await expect(fetch(`http://127.0.0.1:${String(first.port)}/setup`)).rejects.toThrow()
    expect((await fetch(`http://127.0.0.1:${String(second.port)}/setup`)).status).toBe(200)
  })
})
