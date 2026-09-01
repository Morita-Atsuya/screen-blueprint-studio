import { renderToString } from 'react-dom/server'
import { useAppStore } from '../../src/app/appStore'
import { I18nProvider } from '../../src/i18n/I18nProvider'
import type { Locale } from '../../src/i18n/messages'
import { LOCALE_STORAGE_KEY } from '../../src/i18n/locale'
import { sampleProject } from '../../src/sample/sampleProject'
import { Inspector } from '../../src/features/inspector/Inspector'

export function renderInspector(
  componentId: string,
  locale: Locale,
  instanceCount = 1,
  activeStateId = '',
): string {
  const component = sampleProject.components[componentId]
  if (!component) throw new Error(`Unknown sample component: ${componentId}`)
  const screen = sampleProject.screens[component.screenId]
  if (!screen) throw new Error(`Unknown sample screen: ${component.screenId}`)

  localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  const initialState = useAppStore.getInitialState()
  initialState.document = sampleProject
  initialState.effectiveDocument = sampleProject
  initialState.activeChangeSet = null
  initialState.ui = {
    ...initialState.ui,
    activeScreenId: screen.id,
    activeStateId: activeStateId || null,
    selection: { type: 'screenInlineComponent', componentId: component.id },
    rightPanelTab: 'inspector',
  }

  return renderToString(
    <I18nProvider>
      {Array.from({ length: instanceCount }, (_, index) => (
        <Inspector key={index} />
      ))}
    </I18nProvider>,
  )
}
