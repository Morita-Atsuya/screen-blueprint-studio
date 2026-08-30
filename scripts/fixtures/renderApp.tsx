import { renderToString } from 'react-dom/server'
import { useAppStore } from '../../src/app/appStore'
import { App } from '../../src/app/App'
import { I18nProvider } from '../../src/i18n/I18nProvider'
import { LOCALE_STORAGE_KEY } from '../../src/i18n/locale'
import type { Locale } from '../../src/i18n/messages'
import { sampleProject } from '../../src/sample/sampleProject'

export function renderApp(locale: Locale): string {
  localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  const initialState = useAppStore.getInitialState()
  initialState.document = sampleProject
  initialState.effectiveDocument = sampleProject
  initialState.activeChangeSet = {
    id: 'regression-change-set',
    summary: 'Accessibility review',
    baseRevision: sampleProject.revision,
    baseDocument: sampleProject,
    operations: [],
    version: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
  }
  initialState.history = []
  initialState.redoStack = []
  initialState.ui = {
    ...initialState.ui,
    activeScreenId: 'screen-edit',
    activeStateId: 'state-edit-default',
    selectedComponentId: 'comp-name-input',
    rightPanelTab: 'inspector',
  }

  return renderToString(
    <I18nProvider>
      <App />
    </I18nProvider>,
  )
}
