import { describe, expect, it } from 'vitest'
import {
  allowedHostHeaders,
  isAllowedHost,
  isAllowedOrigin,
  isLoopbackHost,
  remoteHostHeaders,
  remoteOrigin,
} from './allowedHosts.js'

describe('allowedHosts', () => {
  it('rejects a host other than loopback', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('0.0.0.0')).toBe(false)
    expect(isLoopbackHost('192.168.1.20')).toBe(false)
    expect(isLoopbackHost('evil.example')).toBe(false)
  })

  it('allows only loopback host headers on the server port', () => {
    const allowed = allowedHostHeaders({ port: 4870, dev: false })
    expect(isAllowedHost('127.0.0.1:4870', allowed)).toBe(true)
    expect(isAllowedHost('localhost:4870', allowed)).toBe(true)
    expect(isAllowedHost('localhost:5173', allowed)).toBe(false)
    expect(isAllowedHost('evil.example:4870', allowed)).toBe(false)
    expect(isAllowedHost(undefined, allowed)).toBe(false)
  })

  it('adds the Vite port in dev mode', () => {
    const allowed = allowedHostHeaders({ port: 4870, dev: true })
    expect(isAllowedHost('localhost:5173', allowed)).toBe(true)
    expect(isAllowedHost('127.0.0.1:5173', allowed)).toBe(true)
  })

  it('checks the origin by its host and port', () => {
    const allowed = allowedHostHeaders({ port: 4870, dev: false })
    expect(isAllowedOrigin('http://localhost:4870', allowed)).toBe(true)
    expect(isAllowedOrigin('http://evil.example', allowed)).toBe(false)
    expect(isAllowedOrigin('not a url', allowed)).toBe(false)
  })

  it('allows the public host only once remote access is configured', () => {
    const allowed = remoteHostHeaders('workday.example.com')
    expect(isAllowedHost('workday.example.com', allowed)).toBe(true)
    expect(isAllowedHost('Workday.Example.com:443', allowed)).toBe(true)
    expect(isAllowedHost('workday.example.com:8080', allowed)).toBe(false)
    expect(isAllowedHost('workday.example.com', remoteHostHeaders(null))).toBe(false)
    expect(remoteOrigin('workday.example.com')).toBe('https://workday.example.com')
  })
})
