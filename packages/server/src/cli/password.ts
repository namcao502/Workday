import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'

const PASSWORD_VARIABLE = 'WORKDAY_IMPORT_PASSWORD'

// The echo goes to a sink, so the typed password never reaches the terminal.
export async function promptPassword(): Promise<string> {
  const sink = new Writable({
    write: (_chunk, _encoding, done) => {
      done()
    },
  })
  const reader = createInterface({ input: process.stdin, output: sink, terminal: true })
  process.stdout.write('Password of the .nwcred file: ')
  try {
    return await reader.question('')
  } finally {
    reader.close()
    process.stdout.write('\n')
  }
}

/** WORKDAY_IMPORT_PASSWORD wins; else the prompt on a TTY; else null. */
export async function passwordFor(
  environment: NodeJS.ProcessEnv,
  isTty: boolean,
  prompt: () => Promise<string>,
): Promise<string | null> {
  const fromEnvironment = environment[PASSWORD_VARIABLE]
  if (fromEnvironment !== undefined && fromEnvironment !== '') {
    return fromEnvironment
  }
  return isTty ? prompt() : null
}
