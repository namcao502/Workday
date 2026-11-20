import { Copy, Minus, Square, Xmark } from '@gravity-ui/icons'
import { Button } from '@heroui/react'
import { useEffect, useState } from 'react'
import { t } from '../i18n.js'
import { Tip } from '../ui/Tip.js'
import { isDesktopShell, onWindowState, sendWindowAction } from './desktopHost.js'

// The three round window buttons of the desktop shell, whose native title bar is gone.
export function WindowControls(): React.JSX.Element | null {
  const [isMaximized, setIsMaximized] = useState(false)
  useEffect(() => onWindowState(setIsMaximized), [])
  if (!isDesktopShell()) {
    return null
  }
  const maximizeLabel = isMaximized ? t('shell.restoreWindow') : t('shell.maximizeWindow')
  return (
    <div className="flex items-center gap-2">
      <Tip content={t('shell.minimizeWindow')} placement="bottom">
        <Button
          isIconOnly
          variant="secondary"
          aria-label={t('shell.minimizeWindow')}
          onPress={() => { sendWindowAction('minimize'); }}
        >
          <Minus width={18} height={18} aria-hidden="true" />
        </Button>
      </Tip>
      <Tip content={maximizeLabel} placement="bottom">
        <Button
          isIconOnly
          variant="secondary"
          aria-label={maximizeLabel}
          onPress={() => { sendWindowAction('toggleMaximize'); }}
        >
          {isMaximized ? (
            <Copy width={16} height={16} aria-hidden="true" />
          ) : (
            <Square width={16} height={16} aria-hidden="true" />
          )}
        </Button>
      </Tip>
      <Tip content={t('shell.closeWindow')} placement="bottom">
        <Button
          isIconOnly
          variant="secondary"
          className="hover:bg-danger hover:text-white"
          aria-label={t('shell.closeWindow')}
          onPress={() => { sendWindowAction('close'); }}
        >
          <Xmark width={18} height={18} aria-hidden="true" />
        </Button>
      </Tip>
    </div>
  )
}
