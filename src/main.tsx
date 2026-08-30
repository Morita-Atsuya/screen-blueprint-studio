import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { App } from './app/App'
import { AppErrorBoundary } from './app/AppErrorBoundary'
import { registerWebMCPTools } from './webmcp/tools'

// Register WebMCP tools (feature-detected; no-op if document.modelContext is absent)
registerWebMCPTools()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
