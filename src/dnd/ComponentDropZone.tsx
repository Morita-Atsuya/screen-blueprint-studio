import { useDndContext, useDroppable } from '@dnd-kit/core'
import { useAppStore } from '../app/appStore'
import {
  canAcceptDrop,
  componentDropId,
  isDropSurfaceCompatible,
  isEditorDragData,
} from './editorDnd'
import type { ComponentDropData } from './editorDnd'
import styles from './ComponentDropZone.module.css'
import { useI18n } from '../i18n/I18nProvider'

interface ComponentDropZoneProps extends Omit<ComponentDropData, 'type' | 'surface'> {
  surface: 'tree' | 'canvas'
  orientation?: 'vertical' | 'horizontal' | 'grid'
  edge?: 'before' | 'end'
}

export function ComponentDropZone({
  surface,
  parentId,
  screenId,
  position,
  label,
  orientation = 'vertical',
  edge = 'before',
}: ComponentDropZoneProps) {
  const { t } = useI18n()
  const document = useAppStore(state => state.effectiveDocument)
  const { active } = useDndContext()
  const drag = active?.data.current
  const validDrag = isEditorDragData(drag)
  const compatibleSurface = validDrag && isDropSurfaceCompatible(drag, { surface })
  const target: ComponentDropData = {
    type: 'component-drop',
    surface,
    parentId,
    screenId,
    position,
    label,
  }
  const accepts = compatibleSurface && canAcceptDrop(document, drag, target)
  const showAffordance = compatibleSurface
  const dropId = componentDropId(surface, parentId, position)
  const { isOver, setNodeRef } = useDroppable({
    id: dropId,
    data: target,
    disabled: validDrag && !compatibleSurface,
  })
  return (
    <div
      ref={setNodeRef}
      className={[
        styles.zone,
        styles[surface],
        styles[orientation],
        edge === 'end' ? styles.end : '',
        showAffordance && accepts ? styles.active : '',
        compatibleSurface && !accepts ? styles.invalid : '',
        isOver && compatibleSurface && accepts ? styles.over : '',
        isOver && compatibleSurface && !accepts ? styles.invalidOver : '',
      ].join(' ')}
      aria-label={t('dnd.dropAria', { label })}
      data-drop-surface={surface}
      data-drop-parent={parentId}
      data-drop-position={position}
      data-drop-orientation={orientation}
      data-editor-drop-id={dropId}
      data-drop-visible={showAffordance || undefined}
      data-drop-outcome={
        compatibleSurface ? accepts ? 'allowed' : 'invalid' : undefined
      }
    />
  )
}
