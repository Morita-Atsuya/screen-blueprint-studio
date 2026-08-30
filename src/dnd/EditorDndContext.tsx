import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useAppStore } from '../app/appStore'
import { createAddComponentCommand } from '../features/palette/componentFactory'
import {
  isComponentDropData,
  isEditorDragData,
  resolveComponentDrop,
} from './editorDnd'
import styles from './EditorDndContext.module.css'
import { useI18n } from '../i18n/I18nProvider'

export function EditorDndProvider({ children }: { children: React.ReactNode }) {
  const { locale, t } = useI18n()
  const [dragLabel, setDragLabel] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragStart(event: DragStartEvent) {
    const drag = event.active.data.current
    setDragLabel(isEditorDragData(drag) ? drag.label : null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragLabel(null)
    const drag = event.active.data.current
    const target = event.over?.data.current
    if (!isEditorDragData(drag)) return
    if (!isComponentDropData(target)) {
      useAppStore.getState().setErrorMessage({ key: 'errors.invalidDrop' })
      return
    }

    const state = useAppStore.getState()
    if (drag.type === 'palette') {
      const command = createAddComponentCommand(
        state.effectiveDocument,
        target.screenId,
        target.parentId,
        drag.kind,
        locale,
        target.position,
      )
      state.dispatch(command, `Add component: ${drag.kind}`)
      useAppStore.getState().setSelectedComponent(command.componentId)
      return
    }

    const resolution = resolveComponentDrop(state.effectiveDocument, drag.componentId, target)
    if (!resolution.ok) {
      state.setErrorMessage({ key: 'errors.invalidDrop' })
      return
    }
    state.dispatch({
      type: 'moveComponent',
      componentId: drag.componentId,
      newParentId: target.parentId,
      position: resolution.position,
    }, `Move component: ${drag.label}`)
    useAppStore.getState().setSelectedComponent(drag.componentId)
  }

  return (
    <DndContext
      sensors={sensors}
      accessibility={{
        announcements: {
          onDragStart({ active }) {
            const drag = active.data.current
            return isEditorDragData(drag)
              ? t('dnd.announcementStart', { label: drag.label })
              : ''
          },
          onDragOver({ over }) {
            const target = over?.data.current
            return isComponentDropData(target)
              ? t('dnd.announcementOver', { label: target.label })
              : ''
          },
          onDragEnd({ active, over }) {
            const drag = active.data.current
            return isEditorDragData(drag)
              ? t(
                  isComponentDropData(over?.data.current)
                    ? 'dnd.announcementEnd'
                    : 'dnd.announcementCancel',
                  { label: drag.label },
                )
              : ''
          },
          onDragCancel({ active }) {
            const drag = active.data.current
            return isEditorDragData(drag)
              ? t('dnd.announcementCancel', { label: drag.label })
              : ''
          },
        },
      }}
      collisionDetection={collisionArguments => {
        if (collisionArguments.pointerCoordinates) {
          const directDrop = document
            .elementsFromPoint(
              collisionArguments.pointerCoordinates.x,
              collisionArguments.pointerCoordinates.y,
            )
            .map(element => element.closest<HTMLElement>('[data-editor-drop-id]'))
            .find((element): element is HTMLElement => element !== null)
          const directId = directDrop?.dataset.editorDropId
          if (directId) return [{ id: directId }]
        }
        const pointerCollisions = pointerWithin(collisionArguments)
        if (pointerCollisions.length === 0) return closestCenter(collisionArguments)
        return pointerCollisions.sort((left, right) => {
          const depth = (id: string | number) => {
            let node = collisionArguments.droppableContainers.find(
              container => container.id === id,
            )?.node.current
            let value = 0
            while (node?.parentElement) {
              value += 1
              node = node.parentElement
            }
            return value
          }
          return depth(right.id) - depth(left.id)
        })
      }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragLabel(null)}
    >
      {children}
      <DragOverlay>
        {dragLabel ? <div className={styles.overlay}>{dragLabel}</div> : null}
      </DragOverlay>
    </DndContext>
  )
}
