import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useAppStore } from './appStore'

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
      <main style={{ padding: 40, textAlign: 'center' }}>
        <h1>画面の表示中に問題が発生しました</h1>
        <p>{this.state.error.message}</p>
        <button onClick={() => useAppStore.getState().exportCurrentData()}>
          現在のJSONを保存
        </button>
        <button
          onClick={() => {
            useAppStore.getState().resetToSample()
            this.setState({ error: null })
          }}
        >
          サンプルで初期化
        </button>
      </main>
    )
  }
}
