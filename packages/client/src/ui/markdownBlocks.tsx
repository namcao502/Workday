import type { Components } from 'react-markdown'
import { CopyBlock } from './CopyBlock.js'

interface HastNode {
  readonly type: string
  readonly value?: string
  readonly children?: readonly HastNode[]
}

// The plain text under a markdown node, for the copy button.
export function nodeText(node: HastNode | undefined): string {
  if (node === undefined) {
    return ''
  }
  if (node.type === 'text') {
    return node.value ?? ''
  }
  return (node.children ?? []).map(nodeText).join('')
}

// Code blocks and quotes of rendered markdown get a copy button (Claude's answers, files, the guide).
export const COPY_BLOCKS: Components = {
  pre: ({ node, children }) => (
    <CopyBlock text={nodeText(node).replace(/\n$/, '')}>
      <pre>{children}</pre>
    </CopyBlock>
  ),
  blockquote: ({ node, children }) => (
    <CopyBlock text={nodeText(node).trim()}>
      <blockquote>{children}</blockquote>
    </CopyBlock>
  ),
}
