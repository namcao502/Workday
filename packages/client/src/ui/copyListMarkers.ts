// Selecting rendered markdown and copying drops the numbers and bullets the page draws; this writes them into the text.
function markerOf(item: Element): string {
  const list = item.parentElement
  if (list === null || list.tagName !== 'OL') {
    return '-'
  }
  const first = Number(list.getAttribute('start') ?? '1')
  const before = [...list.children].filter((child) => child.tagName === 'LI').indexOf(item)
  return `${String((Number.isNaN(first) ? 1 : first) + before)}.`
}

// Null when the selection holds no list item: the browser's own copy is then right.
export function selectionTextWithMarkers(root: HTMLElement, selection: Selection): string | null {
  if (selection.rangeCount === 0 || selection.isCollapsed) {
    return null
  }
  const range = selection.getRangeAt(0)
  const originals = [...root.querySelectorAll('li')].filter((item) => range.intersectsNode(item))
  if (originals.length === 0) {
    return null
  }
  const holder = document.createElement('div')
  holder.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre-wrap'
  holder.append(range.cloneContents())
  holder.querySelectorAll('li').forEach((clone, index) => {
    const original = originals[index]
    if (original !== undefined) {
      clone.prepend(`${markerOf(original)} `)
    }
  })
  document.body.append(holder)
  const text = holder.innerText
  holder.remove()
  return text.trim()
}

export function copyWithListMarkers(event: React.ClipboardEvent<HTMLElement>): void {
  const selection = window.getSelection()
  const text = selection === null ? null : selectionTextWithMarkers(event.currentTarget, selection)
  if (text !== null) {
    event.clipboardData.setData('text/plain', text)
    event.preventDefault()
  }
}
