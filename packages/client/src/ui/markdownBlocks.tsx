import type { Components } from 'react-markdown'
import { CopyBlock } from './CopyBlock.js'

interface HastNode {
  readonly type: string
  readonly value?: string
  readonly tagName?: string
  readonly properties?: Readonly<Record<string, unknown>>
  readonly children?: readonly HastNode[]
}

const BLOCK_TAGS: ReadonlySet<string> = new Set([
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'tr',
])

function isElement(node: HastNode, ...tags: string[]): boolean {
  return node.type === 'element' && tags.includes(node.tagName ?? '')
}

// A list as text: the markers the page draws ("1." / "-") are written out, nested lists indented.
function listText(list: HastNode, depth: number): string {
  const ordered = isElement(list, 'ol')
  const start = typeof list.properties?.['start'] === 'number' ? list.properties['start'] : 1
  const indent = '  '.repeat(depth)
  return (list.children ?? [])
    .filter((child) => isElement(child, 'li'))
    .map((item, index) => {
      const marker = ordered ? `${String(start + index)}.` : '-'
      const nested = (item.children ?? []).filter((child) => isElement(child, 'ol', 'ul'))
      const own = (item.children ?? []).filter((child) => !isElement(child, 'ol', 'ul'))
      const head = `${indent}${marker} ${own
        .map((child) => nodeText(child, depth))
        .join('')
        .trim()}`
      return [head, ...nested.map((child) => listText(child, depth + 1))].join('\n')
    })
    .join('\n')
}

// The plain text under a markdown node, for the copy button: list numbers and line breaks stay.
export function nodeText(node: HastNode | undefined, depth = 0): string {
  if (node === undefined) {
    return ''
  }
  if (node.type === 'text') {
    return node.value ?? ''
  }
  if (isElement(node, 'ol', 'ul')) {
    return `${listText(node, depth)}\n`
  }
  if (isElement(node, 'br')) {
    return '\n'
  }
  const inner = (node.children ?? []).map((child) => nodeText(child, depth)).join('')
  return node.type === 'element' && BLOCK_TAGS.has(node.tagName ?? '') ? `${inner}\n` : inner
}

// Code blocks and quotes of rendered markdown get a copy button (Claude's answers, files, the guide).
export const COPY_BLOCKS: Components = {
  pre: ({ node, children }) => (
    <CopyBlock text={nodeText(node).replace(/\n$/, '')}>
      <pre>{children}</pre>
    </CopyBlock>
  ),
  blockquote: ({ node, children }) => (
    <CopyBlock
      text={nodeText(node)
        .replace(/\n{3,}/g, '\n\n')
        .trim()}
    >
      <blockquote>{children}</blockquote>
    </CopyBlock>
  ),
}
