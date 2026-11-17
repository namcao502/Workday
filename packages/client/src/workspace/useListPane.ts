import { useState } from 'react'
import { useNarrow } from '../shell/useNarrow.js'
import type { SplitControl, SplitHidden } from '../ui/useStoredSplit.js'

export interface ListPane {
  readonly hidden: SplitHidden
  readonly listShown: boolean // the file list is the visible pane (a phone shows one pane at a time)
  readonly toggleList: () => void
  readonly picked: () => void // a file was chosen: a phone goes on to the file itself
}

// Wide: the stored list/viewer split. Narrow (a phone): one pane at a time, the list until a file is chosen.
export function useListPane(split: SplitControl, hasSelection: boolean): ListPane {
  const narrow = useNarrow()
  const [showList, setShowList] = useState<boolean | null>(null)
  if (!narrow) {
    return {
      hidden: split.hidden,
      listShown: split.hidden === 'none',
      toggleList: () => {
        split.setHidden(split.hidden === 'none' ? 'left' : 'none')
      },
      picked: () => undefined,
    }
  }
  const listShown = showList ?? !hasSelection
  return {
    hidden: listShown ? 'right' : 'left',
    listShown,
    toggleList: () => {
      setShowList(!listShown)
    },
    picked: () => {
      setShowList(false)
    },
  }
}
