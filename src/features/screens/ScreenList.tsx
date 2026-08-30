import { nanoid } from 'nanoid'
import { useAppStore } from '../../app/appStore'
import { findAvailableScreenDefaults } from './screenNaming'
import { getOwnEntity } from '../../domain/entityMap'
import styles from './ScreenList.module.css'

export function ScreenList() {
  const { effectiveDocument, ui, dispatch, setActiveScreen } = useAppStore()
  const { project, screens } = effectiveDocument

  function addScreen() {
    const screenId = nanoid()
    const rootComponentId = nanoid()
    const defaultStateId = nanoid()
    const { name, route } = findAvailableScreenDefaults(screens)
    dispatch(
      {
        type: 'addScreen',
        screenId,
        rootComponentId,
        defaultStateId,
        name,
        route,
      },
      `画面を追加: ${name}`,
    )
    setActiveScreen(screenId)
  }

  return (
    <div className={styles.root}>
      <div className={styles.actions}>
        <button className={styles.addBtn} onClick={addScreen}>+ 画面を追加</button>
      </div>
      <ul className={styles.list}>
        {project.screenIds.map(id => {
          const screen = getOwnEntity(screens, id)
          if (!screen) return null
          const isActive = ui.activeScreenId === id
          const isEntry = project.entryScreenId === id
          return (
            <li key={id}>
              <button
                className={`${styles.item} ${isActive ? styles.active : ''}`}
                onClick={() => setActiveScreen(id)}
              >
                <span className={styles.name}>{screen.name}</span>
                {isEntry && <span className={styles.entry}>Entry</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
