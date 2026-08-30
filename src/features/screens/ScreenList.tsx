import { nanoid } from 'nanoid'
import { useAppStore } from '../../app/appStore'
import { findAvailableScreenDefaults } from './screenNaming'
import { getOwnEntity } from '../../domain/entityMap'
import styles from './ScreenList.module.css'

export function ScreenList() {
  const { effectiveDocument, ui, dispatch, setActiveScreen } = useAppStore()
  const { project, screens } = effectiveDocument
  const activeScreen = ui.activeScreenId
    ? getOwnEntity(screens, ui.activeScreenId)
    : undefined

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

  function removeActiveScreen() {
    if (!activeScreen || project.screenIds.length <= 1) return
    const nextEntryScreenId = project.screenIds.find(id => id !== activeScreen.id)
    dispatch(
      {
        type: 'removeScreen',
        screenId: activeScreen.id,
        nextEntryScreenId,
      },
      `画面を削除: ${activeScreen.name}`,
    )
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
      {activeScreen && (
        <div className={styles.editor}>
          <h3 className={styles.editorTitle}>選択中の画面</h3>
          <label className={styles.label}>
            名前
            <input
              className={styles.input}
              value={activeScreen.name}
              onChange={event => dispatch({
                type: 'updateScreen',
                screenId: activeScreen.id,
                name: event.target.value,
              }, '画面名を変更')}
            />
          </label>
          <label className={styles.label}>
            Route
            <input
              className={styles.input}
              value={activeScreen.route}
              onChange={event => dispatch({
                type: 'updateScreen',
                screenId: activeScreen.id,
                route: event.target.value,
              }, '画面routeを変更')}
            />
          </label>
          <div className={styles.manageActions}>
            <button
              className={styles.entryBtn}
              disabled={project.entryScreenId === activeScreen.id}
              onClick={() => dispatch({
                type: 'setEntryScreen',
                screenId: activeScreen.id,
              }, 'Entry画面を変更')}
            >
              {project.entryScreenId === activeScreen.id ? 'Entry画面' : 'Entryに設定'}
            </button>
            <button
              className={styles.deleteBtn}
              disabled={project.screenIds.length <= 1}
              onClick={removeActiveScreen}
            >
              画面を削除
            </button>
          </div>
          {project.screenIds.length <= 1 && (
            <p className={styles.note}>最後の1画面は削除できません。</p>
          )}
        </div>
      )}
    </div>
  )
}
