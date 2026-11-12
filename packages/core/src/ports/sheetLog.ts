// The TSC workbook. Every method resolves; failures come back as values.
export type SheetFailure = 'noToken' | 'dateMismatch' | 'chromeMissing' | 'browserBusy' | 'failed'

export interface SheetError {
  readonly failure: SheetFailure
  readonly detail: string // upstream text, never a token
}

export type SheetWrite = { readonly ok: true } | ({ readonly ok: false } & SheetError)

export type SheetRead =
  | { readonly kind: 'read'; readonly cells: Readonly<Record<string, string | null>> } // a date whose column B did not match is absent
  | { readonly kind: 'noToken' }
  | { readonly kind: 'failed'; readonly detail: string }

export interface SheetLog {
  writeTickets(date: string, text: string): Promise<SheetWrite>
  writeOff(date: string): Promise<SheetWrite>
  readTickets(
    dates: readonly string[],
    options: { readonly allowSniff: boolean },
  ): Promise<SheetRead>
  checkSession(): Promise<{ readonly signedIn: boolean } | SheetError>
  signIn(): Promise<SheetWrite>
}
