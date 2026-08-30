import { nanoid } from 'nanoid'
import { useAppStore } from '../../app/appStore'
import { findAvailableScreenDefaults } from './screenNaming'
import { getOwnEntity } from '../../domain/entityMap'
import { useI18n } from '../../i18n/I18nProvider'
import styles from './ScreenList.module.css'

export function ScreenList() {
  const { locale, t } = useI18n()
  const { effectiveDocument, ui, dispatch, setActiveScreen } = useAppStore()
  const { project, screens } = effectiveDocument
  const activeScreen = ui.activeScreenId
    ? getOwnEntity(screens, ui.activeScreenId)
    : undefined

  function addScreen() {
    const screenId = nanoid()
    const rootComponentId = nanoid()
    const defaultStateId = nanoid()
    const { name, route } = findAvailableScreenDefaults(screens, locale)
    dispatch(
      {
        type: 'addScreen',
        screenId,
        rootComponentId,
        defaultStateId,
        name,
        route,
      },
      `Add screen: ${name}`,
    )
    setActiveScreen(screenId)
  }

  function removeActiveScreen() {
    if (!activeScreen || project.screenIds.length <= 1) return
    dispatch(
      {
        type: 'removeScreen',
        screenId: activeScreen.id,
      },
      `Delete screen: ${activeScreen.name}`,
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.actions}>
        <button className={styles.addBtn} onClick={addScreen}>+ {t('screens.add')}</button>
      </div>
      <ul className={styles.list}>
        {project.screenIds.map(id => {
          const screen = getOwnEntity(screens, id)
          if (!screen) return null
          const isActive = ui.activeScreenId === id
          return (
            <li key={id}>
              <button
                className={`${styles.item} ${isActive ? styles.active : ''}`}
                onClick={() => setActiveScreen(id)}
              >
                <span className={styles.name}>{screen.name}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {activeScreen && (
        <div className={styles.editor}>
          <h3 className={styles.editorTitle}>{t('screens.selected')}</h3>
          <label className={styles.label}>
            {t('screens.name')}
            <input
              className={styles.input}
              value={activeScreen.name}
              onChange={event => dispatch({
                type: 'updateScreen',
                screenId: activeScreen.id,
                name: event.target.value,
              }, 'Update screen name')}
            />
          </label>
          <label className={styles.label}>
            {t('screens.route')}
            <input
              className={styles.input}
              value={activeScreen.route}
              onChange={event => dispatch({
                type: 'updateScreen',
                screenId: activeScreen.id,
                route: event.target.value,
              }, 'Update screen route')}
            />
          </label>
          <div className={styles.manageActions}>
            <button
              className={styles.deleteBtn}
              disabled={project.screenIds.length <= 1}
              onClick={removeActiveScreen}
            >
              {t('screens.delete')}
            </button>
          </div>
          {project.screenIds.length <= 1 && (
            <p className={styles.note}>{t('screens.lastCannotDelete')}</p>
          )}
        </div>
      )}
    </div>
  )
}
