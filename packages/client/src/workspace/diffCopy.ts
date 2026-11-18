const NEW_SIDE_TEXT = 'tr:not(.diff-removed, .diff-gap) .diff-text'

// The selected part of one line's text: the whole cell, cut at the selection's ends when they fall inside it.
function selectedPart(selection: Range, cell: HTMLElement): string {
  const part = document.createRange()
  part.selectNodeContents(cell)
  if (selection.compareBoundaryPoints(Range.START_TO_START, part) > 0) {
    part.setStart(selection.startContainer, selection.startOffset)
  }
  if (selection.compareBoundaryPoints(Range.END_TO_END, part) < 0) {
    part.setEnd(selection.endContainer, selection.endOffset)
  }
  return part.toString()
}

// Copy gives only the new file's text, as Monaco does.
// A selection inside removed lines alone keeps the browser's copy.
export function copyNewSide(event: React.ClipboardEvent<HTMLElement>): void {
  const selection = window.getSelection()
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) {
    return
  }
  const range = selection.getRangeAt(0)
  const lines = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(NEW_SIDE_TEXT))
    .filter((cell) => range.intersectsNode(cell))
    .map((cell) => selectedPart(range, cell))
  if (lines.length === 0) {
    return
  }
  event.preventDefault()
  event.clipboardData.setData('text/plain', lines.join('\n'))
}
