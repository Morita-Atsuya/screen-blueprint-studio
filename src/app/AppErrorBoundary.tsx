import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useAppStore } from './appStore'
import { useI18n } from '../i18n/I18nProvider'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unexpected application render failure', error, info)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <LocalizedErrorFallback
        error={this.state.error}
        onReset={() => this.setState({ error: null })}
      />
    )
  }
}

function LocalizedErrorFallback({ error, onReset }: { error: Error; onReset(): void }) {
  const { t } = useI18n()
  return (
    <main style={{ padding: 40, textAlign: 'center' }}>
      <h1>{t('errors.renderFailure')}</h1>
      <p>{error.message}</p>
      <button onClick={() => useAppStore.getState().exportCurrentData()}>
        {t('app.downloadCurrent')}
      </button>
      <button
        onClick={() => {
          useAppStore.getState().resetToSample()
          onReset()
        }}
      >
        {t('app.resetSample')}
      </button>
    </main>
  )
}
