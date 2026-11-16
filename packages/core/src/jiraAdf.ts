// Jira's Atlassian Document Format as plain text, so a description can be compared and diffed line by line.

type Json = Readonly<Record<string, unknown>>

const BLANK_RUNS = /\n{3,}/g

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringOf(node: Json, name: string): string | null {
  const value = node[name]
  return typeof value === 'string' ? value : null
}

function attributeOf(node: Json, name: string): string | null {
  const attributes = node['attrs']
  return isObject(attributes) ? stringOf(attributes, name) : null
}

function childrenOf(node: Json): readonly Json[] | null {
  const content = node['content']
  return Array.isArray(content) ? (content as readonly unknown[]).filter(isObject) : null
}

function contentText(node: Json): string {
  return (childrenOf(node) ?? []).map(nodeText).join('')
}

// One line per item; an item's own paragraphs are joined, so a nested list stays on the lines below it.
function listText(node: Json, isOrdered: boolean): string {
  const items = childrenOf(node)
  if (items === null) {
    return ''
  }
  const lines = items.map((item, index) => {
    const itemText = contentText(item).replaceAll('\n\n', '\n').replace(BLANK_RUNS, '\n').trim()
    return `${isOrdered ? `${String(index + 1)}. ` : '- '}${itemText}\n`
  })
  return `${lines.join('')}\n`
}

function tableText(node: Json): string {
  const rows = childrenOf(node)
  if (rows === null) {
    return ''
  }
  const lines: string[] = []
  for (const row of rows) {
    const cells = childrenOf(row)
    if (cells !== null) {
      lines.push(
        `${cells.map((cell) => contentText(cell).replaceAll('\n', ' ').trim()).join(' | ')}\n`,
      )
    }
  }
  return `${lines.join('')}\n`
}

function nodeText(node: Json): string {
  const type = stringOf(node, 'type')
  switch (type) {
    case 'text':
      return stringOf(node, 'text') ?? ''
    case 'hardBreak':
      return '\n'
    case 'mention':
    case 'emoji':
      return attributeOf(node, 'text') ?? attributeOf(node, 'shortName') ?? ''
    case 'inlineCard':
      return attributeOf(node, 'url') ?? ''
    case 'media':
    case 'mediaSingle':
    case 'mediaGroup':
      return '[image]\n\n'
    case 'paragraph':
    case 'heading':
      return `${contentText(node)}\n\n`
    case 'bulletList':
    case 'orderedList':
      return listText(node, type === 'orderedList')
    case 'codeBlock':
      return `\`\`\`\n${contentText(node)}\n\`\`\`\n\n`
    case 'table':
      return tableText(node)
    default:
      return contentText(node)
  }
}

// A plain string (an API v2 description) is kept as it is; anything else that is not a document reads as empty.
export function adfToText(node: unknown): string {
  let text: string
  if (typeof node === 'string') {
    text = node
  } else if (isObject(node)) {
    text = nodeText(node)
  } else {
    return ''
  }
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').replace(BLANK_RUNS, '\n\n').trim()
}
