import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { coreText, isInRanges, type CoreTextKey, type WorkdayConfig } from '@workday/core'
import type { LanTls } from './lanCertificates.js'

const CSP = "default-src 'none'; style-src 'unsafe-inline'"

export interface SetupServerOptions {
  readonly address: string
  readonly port: number
  readonly httpsUrl: string
  readonly allowedRanges: readonly string[]
  readonly tls: () => Promise<LanTls> // the CA to serve
  readonly language: () => WorkdayConfig['language']
}

// The setup page's steps, in order; the text of each language is in core's i18n files.
const STEP_KEYS: readonly CoreTextKey[] = [
  'setup.stepDownload',
  'setup.stepInstall',
  'setup.stepTrust',
  'setup.stepOpen',
]

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderPage(
  language: WorkdayConfig['language'],
  httpsUrl: string,
  fingerprint: string,
): string {
  const say = (key: CoreTextKey): string => escapeHtml(coreText(language, key))
  const steps = STEP_KEYS.map((key) => `<li>${say(key)}</li>`).join('')
  const url = escapeHtml(httpsUrl)
  return (
    `<!doctype html><html lang="${language}"><head><meta charset="utf-8">` +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${say('setup.title')}</title>` +
    '<style>body{font:16px system-ui;margin:1.5rem;line-height:1.5}code{word-break:break-all}</style>' +
    `</head><body><h1>${say('setup.title')}</h1><p>${say('setup.intro')}</p>` +
    `<p><a href="/ca.cer">${say('setup.download')}</a></p><ol>${steps}</ol>` +
    `<p>${say('setup.addressLabel')}: <a href="${url}">${url}</a></p>` +
    `<p>${say('setup.fingerprint')}:<br><code>${escapeHtml(fingerprint)}</code></p>` +
    '</body></html>'
  )
}

function sameOptions(a: SetupServerOptions, b: SetupServerOptions): boolean {
  return (
    a.address === b.address &&
    a.port === b.port &&
    a.httpsUrl === b.httpsUrl &&
    a.allowedRanges.join(',') === b.allowedRanges.join(',')
  )
}

function sendText(response: ServerResponse, status: number): void {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
  response.end()
}

// Plain-HTTP page on the LAN that hands the phone the CA; nothing else is served.
export class SetupServer {
  private current: { readonly options: SetupServerOptions; readonly server: Server } | null = null

  get isOpen(): boolean {
    return this.current !== null
  }

  async open(options: SetupServerOptions): Promise<void> {
    if (this.current !== null) {
      if (sameOptions(this.current.options, options)) {
        return
      }
      await this.close()
    }
    const server = createServer((request, response) => {
      void this.handle(options, request, response)
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(options.port, options.address, () => {
        server.off('error', reject)
        resolve()
      })
    })
    this.current = { options, server }
  }

  async close(): Promise<void> {
    const open = this.current
    this.current = null
    if (open === null) {
      return
    }
    await new Promise<void>((resolve) => {
      open.server.close(() => {
        resolve()
      })
      open.server.closeAllConnections()
    })
  }

  private async handle(
    options: SetupServerOptions,
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    try {
      if (!isInRanges(request.socket.remoteAddress ?? '', options.allowedRanges)) {
        sendText(response, 403)
        return
      }
      const path = new URL(request.url ?? '/', 'http://setup.invalid').pathname
      if (request.method !== 'GET' || (path !== '/setup' && path !== '/ca.cer')) {
        sendText(response, 404)
        return
      }
      const tls = await options.tls()
      if (path === '/ca.cer') {
        response.writeHead(200, {
          'Content-Type': 'application/x-x509-ca-cert',
          'Cache-Control': 'no-store',
        })
        response.end(tls.caDer)
        return
      }
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': CSP,
      })
      response.end(renderPage(options.language(), options.httpsUrl, tls.caFingerprint))
    } catch {
      if (!response.headersSent) {
        sendText(response, 500)
      }
    }
  }
}
