import { Button } from '@heroui/react'
import { t } from '../i18n.js'
import { useNewVersion } from './newVersion.js'

// The one real reload left in the app window: only offered once a new build is out.
export function UpdateBanner(): React.JSX.Element | null {
  const ready = useNewVersion()
  if (!ready) {
    return null
  }
  return (
    <div
      role="status"
      className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-surface px-4 py-2 text-sm shadow-surface md:bottom-4"
    >
      {t('shell.newVersionReady')}
      <Button
        size="sm"
        variant="primary"
        onPress={() => {
          window.location.reload()
        }}
      >
        {t('shell.reload')}
      </Button>
    </div>
  )
}
