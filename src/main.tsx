import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { App } from './app/App'
import { AppErrorBoundary } from './app/AppErrorBoundary'
import { registerWebMCPTools } from './webmcp/tools'
import { I18nProvider } from './i18n/I18nProvider'

// Registration is feature-detected and fail-visible without blocking the human UI.
void registerWebMCPTools()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </I18nProvider>
  </StrictMode>,
)
