import { Button } from '@heroui/react'
import { Component, type ReactNode } from 'react'
import { t } from '../i18n.js'

interface ErrorBoundaryProps {
  readonly children: ReactNode
  // A changed key clears a caught error, so navigating to another page recovers the boundary on its own.
  readonly resetKey?: string
}

interface ErrorBoundaryState {
  readonly error: Error | null
}

// Catches a render-time throw so one broken screen shows a retry instead of blanking the whole app.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error): void {
    console.error('A component failed to render', error)
  }

  override componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.error !== null && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  private readonly retry = (): void => {
    this.setState({ error: null })
  }

  override render(): ReactNode {
    if (this.state.error === null) {
      return this.props.children
    }
    return (
      <div
        role="alert"
        className="m-auto flex max-w-sm flex-col items-center gap-3 p-8 text-center"
      >
        <h2 className="text-lg font-semibold">{t('app.appCrashedTitle')}</h2>
        <p className="text-sm text-muted">{t('app.appCrashedHint')}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onPress={this.retry}>
            {t('app.tryAgain')}
          </Button>
          <Button
            variant="primary"
            onPress={() => {
              window.location.reload()
            }}
          >
            {t('app.reload')}
          </Button>
        </div>
      </div>
    )
  }
}
