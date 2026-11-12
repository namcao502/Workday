const LOOPBACK_HOSTS: readonly string[] = ['127.0.0.1', 'localhost']
const VITE_DEV_PORT = 5173

export interface AllowedHostOptions {
  port: number
  dev: boolean
}

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.includes(host)
}

// Host headers a browser on this machine may use; the Vite port is added only in dev.
export function allowedHostHeaders(options: AllowedHostOptions): ReadonlySet<string> {
  const ports = options.dev ? [options.port, VITE_DEV_PORT] : [options.port]
  return new Set(ports.flatMap((port) => LOOPBACK_HOSTS.map((host) => `${host}:${String(port)}`)))
}

export function isAllowedHost(
  hostHeader: string | undefined,
  allowed: ReadonlySet<string>,
): boolean {
  return hostHeader !== undefined && allowed.has(hostHeader.toLowerCase())
}

export function isAllowedOrigin(origin: string, allowed: ReadonlySet<string>): boolean {
  try {
    return allowed.has(new URL(origin).host.toLowerCase())
  } catch {
    return false
  }
}
