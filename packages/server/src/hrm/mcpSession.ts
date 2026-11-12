import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const CALL_TIMEOUT_MILLISECONDS = 30_000
const CLIENT_NAME = 'workday'
const CLIENT_VERSION = '0.1.0'

export interface McpToolResult {
  readonly isError: boolean
  readonly text: string | null
}

// The only seam that touches the MCP SDK; tests fake this.
export interface McpSession {
  callTool(name: string, args: Readonly<Record<string, unknown>>): Promise<McpToolResult>
  listTools(): Promise<void>
  close(): Promise<void>
}

function firstText(content: unknown): string | null {
  if (!Array.isArray(content)) {
    return null
  }
  for (const block of content as readonly unknown[]) {
    if (typeof block === 'object' && block !== null) {
      const { type, text } = block as { type?: unknown; text?: unknown }
      if (type === 'text' && typeof text === 'string') {
        return text
      }
    }
  }
  return null
}

// Opens a Streamable HTTP session; the key goes only to the given url, as a Bearer header.
export async function connectMcp(url: string, apiKey: string): Promise<McpSession> {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
  })
  const client = new Client({ name: CLIENT_NAME, version: CLIENT_VERSION })
  await client.connect(transport)
  return {
    async callTool(name, args) {
      // The abort signal rejects with a TimeoutError, which retryTransient treats as transient.
      const result = await client.callTool({ name, arguments: { ...args } }, undefined, {
        signal: AbortSignal.timeout(CALL_TIMEOUT_MILLISECONDS),
      })
      return { isError: result.isError === true, text: firstText(result.content) }
    },
    async listTools() {
      await client.listTools()
    },
    close: () => client.close(),
  }
}
