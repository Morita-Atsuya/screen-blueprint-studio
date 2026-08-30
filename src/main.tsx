import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { App } from './app/App'
import { AppErrorBoundary } from './app/AppErrorBoundary'
import { registerWebMCPTools } from './webmcp/tools'
import { I18nProvider } from './i18n/I18nProvider'

// Register WebMCP tools (feature-detected; no-op if document.modelContext is absent)
registerWebMCPTools()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </I18nProvider>
  </StrictMode>,
)
