export interface GuideSection {
  readonly id: string
  readonly title: string
  readonly body: string
}

export const INTRO_ID = 'intro'

const FENCE = /^\s*(```|~~~)/
const HEADING = /^##\s+(.+?)\s*$/

function slugify(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug === '' ? 'section' : slug
}

// Splits on level-2 headings; the text before the first one comes back as the intro section.
export function splitGuide(markdown: string): readonly GuideSection[] {
  const sections: GuideSection[] = []
  const used = new Map<string, number>()
  let title = ''
  let id = INTRO_ID
  let body: string[] = []
  let inFence = false

  const flush = (): void => {
    const text = body.join('\n')
    if (id !== INTRO_ID || text.trim() !== '') {
      sections.push({ id, title, body: text })
    }
  }

  for (const line of markdown.split('\n')) {
    if (FENCE.test(line)) {
      inFence = !inFence
    }
    const match = inFence ? null : HEADING.exec(line)
    if (match === null || match[1] === undefined) {
      body = [...body, line]
      continue
    }
    flush()
    title = match[1]
    const base = slugify(title)
    const count = (used.get(base) ?? 0) + 1
    used.set(base, count)
    id = count === 1 ? base : `${base}-${String(count)}`
    body = []
  }
  flush()
  return sections
}
