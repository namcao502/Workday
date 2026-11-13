export interface ShellLaunch {
  readonly file: string
  readonly args: readonly string[]
}

export interface ShellLaunchOptions {
  readonly platform: 'win32' | 'other'
  readonly powerShell7Path: string | null
  readonly claudeExecutable: string
  readonly settingsFile: string | null
  readonly argument: string | null
  readonly rcFile: string | null // 'other' only: path the server wrote the bash rc to
}

export interface SessionArgumentInput {
  readonly savedSessionId: string | null
  readonly transcriptExists: boolean
  readonly folderHasTranscripts: boolean
  readonly isMain: boolean
  readonly startPrompt: string | null // already has {key} replaced
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function powerShellQuote(text: string): string {
  return `'${text.replaceAll("'", "''")}'`
}

function bashQuote(text: string): string {
  return `'${text.replaceAll("'", "'\\''")}'`
}

function hasQuoteOrControl(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    if (code === 0x22 || code < 0x20 || code === 0x7f) {
      return true
    }
  }
  return false
}

// A double quote would end the -Command string; control characters could inject a second command.
function checkedArgument(argument: string | null): string | null {
  if (argument === null || argument === '') {
    return null
  }
  if (hasQuoteOrControl(argument)) {
    throw new Error('Launch argument holds a double quote or control character')
  }
  return argument
}

function quoted(argument: string, quote: (text: string) => string): string {
  return argument.startsWith('--') ? argument : quote(argument)
}

export function bashRcText(
  claudeExecutable: string,
  settingsFile: string | null,
  argument: string | null,
): string {
  const arg = checkedArgument(argument)
  const settings = settingsFile === null || settingsFile === '' ? '' : ` --settings ${bashQuote(settingsFile)}`
  return [
    'if [ -f ~/.bashrc ]; then . ~/.bashrc; fi',
    `claude() { command ${bashQuote(claudeExecutable)}${settings} "$@"; }`,
    arg === null ? 'claude' : `claude ${quoted(arg, bashQuote)}`,
    '',
  ].join('\n')
}

// A shell that runs claude at once and stays at its prompt after /exit; its `claude` function adds the hook settings.
export function buildShellLaunch(options: ShellLaunchOptions): ShellLaunch {
  const argument = checkedArgument(options.argument)
  if (options.platform === 'other') {
    if (options.rcFile === null) {
      throw new Error('rcFile is required outside Windows')
    }
    return { file: 'bash', args: ['--rcfile', options.rcFile, '-i'] }
  }
  const settings =
    options.settingsFile === null || options.settingsFile === ''
      ? ''
      : ` --settings ${powerShellQuote(options.settingsFile)}`
  const call = argument === null ? 'claude' : `claude ${quoted(argument, powerShellQuote)}`
  const script = `function global:claude { & ${powerShellQuote(options.claudeExecutable)}${settings} @args }; ${call}`
  return {
    file: options.powerShell7Path ?? 'powershell.exe',
    args: ['-NoLogo', '-NoExit', '-Command', script],
  }
}

// Claude Code names a project folder after the working directory with every non-alphanumeric turned into '-'.
export function claudeProjectDirName(folderPath: string): string {
  const trimmed = folderPath.replace(/[\\/]+$/, '')
  return (trimmed === '' ? folderPath : trimmed).replace(/[^a-zA-Z0-9]/g, '-')
}

// The start prompt wins; then a resumable saved id; --continue only for the main session of a folder with transcripts.
export function sessionArgument(input: SessionArgumentInput): string | null {
  if (input.startPrompt !== null && input.startPrompt !== '') {
    return input.startPrompt
  }
  if (input.savedSessionId !== null && GUID.test(input.savedSessionId) && input.transcriptExists) {
    return `--resume ${input.savedSessionId.toLowerCase()}`
  }
  return input.isMain && input.folderHasTranscripts ? '--continue' : null
}

const TOOL_SHELL_VARIABLES: ReadonlySet<string> = new Set(['NO_COLOR', 'AI_AGENT', 'DISABLE_AUTOUPDATER'])

// Inherited from a Claude Code session these make a new claude think it is a child and stop saving transcripts.
export function isClaudeSessionVariable(name: string): boolean {
  const upper = name.toUpperCase()
  return upper.startsWith('CLAUDE') || upper.startsWith('ANTHROPIC') || TOOL_SHELL_VARIABLES.has(upper)
}
