import { useDndContext, useDroppable } from '@dnd-kit/core'
import { useAppStore } from '../app/appStore'
import { canAcceptDrop, componentDropId, isEditorDragData } from './editorDnd'
import type { ComponentDropData } from './editorDnd'
import styles from './ComponentDropZone.module.css'

interface ComponentDropZoneProps extends Omit<ComponentDropData, 'type'> {
  surface: 'tree' | 'canvas'
  empty?: boolean
}

export function ComponentDropZone({
  surface,
  parentId,
  screenId,
  position,
  label,
  empty = false,
}: ComponentDropZoneProps) {
  const document = useAppStore(state => state.effectiveDocument)
  const { active } = useDndContext()
  const drag = active?.data.current
  const validDrag = isEditorDragData(drag)
  const target: ComponentDropData = {
    type: 'component-drop',
    parentId,
    screenId,
    position,
    label,
  }
  const accepts = !validDrag || canAcceptDrop(document, drag, target)
  const showAffordance = validDrag && accepts
  const dropId = componentDropId(surface, parentId, position)
  const { isOver, setNodeRef } = useDroppable({
    id: dropId,
    data: target,
    disabled: validDrag && !accepts,
  })
  const isActiveOver = isOver && showAffordance

  return (
    <div
      ref={setNodeRef}
      className={[
        styles.zone,
        styles[surface],
        showAffordance ? styles.active : '',
        validDrag && !accepts ? styles.invalid : '',
        isActiveOver ? styles.over : '',
        empty && showAffordance ? styles.empty : '',
      ].join(' ')}
      aria-label={`${label}へドロップ`}
      data-drop-surface={surface}
      data-drop-parent={parentId}
      data-drop-position={position}
      data-editor-drop-id={dropId}
      data-drop-visible={showAffordance}
    >
      {isActiveOver && empty ? 'ここにドロップ' : ''}
    </div>
  )
}
