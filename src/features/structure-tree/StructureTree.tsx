import { useAppStore } from '../../app/appStore'
import type { EntityId } from '../../domain/model'
import { getOwnEntity } from '../../domain/entityMap'
import styles from './StructureTree.module.css'

export function StructureTree() {
  const { effectiveDocument, ui, setSelectedComponent, dispatch } = useAppStore()
  const { activeScreenId, selectedComponentId } = ui

  if (!activeScreenId) return <p className={styles.empty}>画面を選択してください</p>

  const screen = getOwnEntity(effectiveDocument.screens, activeScreenId)
  if (!screen) return null

  function renderNode(id: EntityId, depth: number): React.ReactNode {
    const comp = getOwnEntity(effectiveDocument.components, id)
    if (!comp) return null
    const isSelected = selectedComponentId === comp.id
    const isRoot = comp.parentId === null

    return (
      <li key={comp.id}>
        <div
          className={`${styles.node} ${isSelected ? styles.selected : ''}`}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          onClick={() => setSelectedComponent(comp.id)}
        >
          <span className={styles.kind}>{comp.kind}</span>
          <span className={styles.name}>{comp.name}</span>
          {!isRoot && (
            <div className={styles.nodeActions}>
              <button
                className={styles.iconBtn}
                title="上へ移動"
                onClick={e => { e.stopPropagation(); moveUp(comp.id) }}
              >↑</button>
              <button
                className={styles.iconBtn}
                title="下へ移動"
                onClick={e => { e.stopPropagation(); moveDown(comp.id) }}
              >↓</button>
              <button
                className={`${styles.iconBtn} ${styles.danger}`}
                title="削除"
                onClick={e => { e.stopPropagation(); remove(comp.id) }}
              >×</button>
            </div>
          )}
        </div>
        {comp.childIds.length > 0 && (
          <ul className={styles.children}>
            {comp.childIds.map(childId => renderNode(childId, depth + 1))}
          </ul>
        )}
      </li>
    )
  }

  function moveUp(id: EntityId) {
    const comp = getOwnEntity(effectiveDocument.components, id)
    if (!comp?.parentId) return
    const parent = getOwnEntity(effectiveDocument.components, comp.parentId)
    if (!parent) return
    const idx = parent.childIds.indexOf(id)
    if (idx <= 0) return
    dispatch({ type: 'moveComponent', componentId: id, newParentId: comp.parentId, position: idx - 1 }, '上へ移動')
  }

  function moveDown(id: EntityId) {
    const comp = getOwnEntity(effectiveDocument.components, id)
    if (!comp?.parentId) return
    const parent = getOwnEntity(effectiveDocument.components, comp.parentId)
    if (!parent) return
    const idx = parent.childIds.indexOf(id)
    if (idx === -1 || idx >= parent.childIds.length - 1) return
    dispatch({ type: 'moveComponent', componentId: id, newParentId: comp.parentId, position: idx + 1 }, '下へ移動')
  }

  function remove(id: EntityId) {
    dispatch({ type: 'removeComponent', componentId: id }, 'コンポーネント削除')
    if (selectedComponentId === id) setSelectedComponent(null)
  }

  return (
    <ul className={styles.root}>
      {renderNode(screen.rootComponentId, 0)}
    </ul>
  )
}
