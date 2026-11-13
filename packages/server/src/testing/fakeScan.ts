import type { ScanProcess } from '../schedules/scanProcess.js'

// A scan process a test drives by hand: say() prints, end() exits, kill() ends it like a killed tree.
export class FakeScanProcess implements ScanProcess {
  killed = 0
  private output: (chunk: string) => void = () => undefined
  private exit: (code: number | null) => void = () => undefined

  onOutput(listener: (chunk: string) => void): void {
    this.output = listener
  }
  onExit(listener: (code: number | null) => void): void {
    this.exit = listener
  }
  onError(): void {
    // Not needed: a fake never fails to start.
  }
  kill(): void {
    this.killed += 1
    this.exit(null)
  }
  say(text: string): void {
    this.output(text)
  }
  end(code: number): void {
    this.exit(code)
  }
}
