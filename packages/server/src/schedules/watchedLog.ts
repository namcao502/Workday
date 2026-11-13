import { statSync } from 'node:fs'
import { open } from 'node:fs/promises'

// Follows a file the scan script appends to, handing out only the bytes added since the last read.
export class WatchedLog {
  private offset = 0

  constructor(private readonly path: string) {}

  // Remembers the size now, so lines from earlier runs are not copied. A missing file starts at 0.
  begin(): void {
    try {
      this.offset = statSync(this.path).size
    } catch {
      this.offset = 0
    }
  }

  // Whole lines only, except the final read. Missing file gives empty; a shrunk file restarts at 0.
  async readNew(final: boolean): Promise<string> {
    let handle
    try {
      handle = await open(this.path, 'r')
    } catch {
      return ''
    }
    try {
      const { size } = await handle.stat()
      if (size < this.offset) {
        this.offset = 0
      }
      if (size === this.offset) {
        return ''
      }
      const buffer = Buffer.alloc(size - this.offset)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, this.offset)
      const lastNewline = buffer.lastIndexOf(0x0a, bytesRead - 1)
      const used = final || lastNewline < 0 ? (final ? bytesRead : 0) : lastNewline + 1
      this.offset += used
      return buffer.toString('utf8', 0, used)
    } catch {
      return ''
    } finally {
      await handle.close()
    }
  }
}
