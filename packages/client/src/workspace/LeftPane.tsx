import { useState } from 'react'
import { openInVsCode } from '../api/workspaceApi.js'
import { t } from '../i18n.js'
import { ChangesView } from './ChangesView.js'
import { FilesView } from './FilesView.js'

type LeftTab = 'changes' | 'files'

interface LeftPaneProps {
  readonly tabId: string
  readonly onHide: () => void
}

export function LeftPane({ tabId, onHide }: LeftPaneProps): React.JSX.Element {
  const [tab, setTab] = useState<LeftTab>('files')
  return (
    <div className="workspace-left" data-testid="workspace-left">
      <div className="pane-toolbar">
        <div className="segmented" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'changes'}
            data-selected={tab === 'changes'}
            onClick={() => {
              setTab('changes')
            }}
          >
            {t('Changes', 'Thay đổi')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'files'}
            data-selected={tab === 'files'}
            onClick={() => {
              setTab('files')
            }}
          >
            {t('Files', 'Tệp')}
          </button>
        </div>
        <button
          type="button"
          className="button ghost"
          onClick={() => {
            void openInVsCode(tabId)
          }}
        >
          VS Code
        </button>
        <button type="button" className="button ghost" onClick={onHide}>
          {t('Hide', 'Ẩn')}
        </button>
      </div>
      <div className="pane-scroll">
        {tab === 'changes' ? <ChangesView tabId={tabId} /> : <FilesView tabId={tabId} />}
      </div>
    </div>
  )
}
