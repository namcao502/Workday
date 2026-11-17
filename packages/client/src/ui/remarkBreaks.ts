// A single newline inside a paragraph is a line break, as in the WPF viewer (plain markdown folds it into a space).
interface MdNode {
  type: string
  value?: string
  children?: MdNode[]
}

function splitLines(node: MdNode): MdNode[] {
  const lines = (node.value ?? '').split('\n')
  return lines.flatMap((line, index): MdNode[] => {
    const text: MdNode[] = line === '' ? [] : [{ type: 'text', value: line }]
    return index === 0 ? text : [{ type: 'break' }, ...text]
  })
}

function walk(node: MdNode): void {
  if (node.children === undefined || node.type === 'code' || node.type === 'inlineCode') {
    return
  }
  node.children = node.children.flatMap((child) =>
    child.type === 'text' && (child.value ?? '').includes('\n') ? splitLines(child) : [child],
  )
  node.children.forEach(walk)
}

export function remarkBreaks(): (tree: MdNode) => void {
  return (tree) => {
    walk(tree)
  }
}
