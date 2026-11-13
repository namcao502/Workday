// Claude Code names a project folder after the working directory with every non-alphanumeric turned into '-'.
export function claudeProjectDirName(folderPath: string): string {
  const trimmed = folderPath.replace(/[\\/]+$/, '')
  return (trimmed === '' ? folderPath : trimmed).replace(/[^a-zA-Z0-9]/g, '-')
}

const TOOL_SHELL_VARIABLES: ReadonlySet<string> = new Set([
  'NO_COLOR',
  'AI_AGENT',
  'DISABLE_AUTOUPDATER',
])

// Inherited from a Claude Code session these make a new claude think it is a child and stop saving transcripts.
export function isClaudeSessionVariable(name: string): boolean {
  const upper = name.toUpperCase()
  return (
    upper.startsWith('CLAUDE') || upper.startsWith('ANTHROPIC') || TOOL_SHELL_VARIABLES.has(upper)
  )
}
