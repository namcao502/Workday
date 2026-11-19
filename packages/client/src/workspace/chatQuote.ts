// The draft with the selected text added as a markdown quote, then a blank line for the reply.
export function withQuote(draft: string, selected: string): string {
  const quote = selected
    .trim()
    .split(/\r?\n/)
    .map((line) => `> ${line}`.trimEnd())
    .join('\n')
  const before = draft.trimEnd()
  return `${before === '' ? '' : `${before}\n\n`}${quote}\n\n`
}
