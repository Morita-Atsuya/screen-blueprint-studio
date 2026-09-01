import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  defaultKeyboardCoordinateGetter,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { useAppStore } from '../app/appStore'
import { createAddComponentCommand } from '../features/palette/componentFactory'
import {
  isComponentDropData,
  isDropSurfaceCompatible,
  isEditorDragData,
  resolveEditorDrop,
} from './editorDnd'
import type { EditorDropOutcome } from './editorDnd'
import styles from './EditorDndContext.module.css'
import { useI18n } from '../i18n/I18nProvider'
import type { MessageKey } from '../i18n/messages'
import type { ComponentPlacementInvalidReason } from '../domain/componentPlacement'
import {
  DEFAULT_COMPONENT_PLACEMENT,
  DEFAULT_COMPONENT_SIZING,
} from '../domain/model'

const DROP_ERROR_KEYS: Record<
  ComponentPlacementInvalidReason | 'surfaceMismatch',
  MessageKey
> = {
  root: 'errors.dropRoot',
  selfOrDescendant: 'errors.dropDescendant',
  parentCannotContainChildren: 'errors.dropParentLeaf',
  componentConstraint: 'errors.dropComponentConstraint',
  crossScreen: 'errors.dropCrossScreen',
  stale: 'errors.dropStale',
  invalidPosition: 'errors.dropPosition',
  domainValidation: 'errors.dropDomainValidation',
  surfaceMismatch: 'errors.dropSurfaceMismatch',
}

type CompletedDropOutcome = EditorDropOutcome | { status: 'cancelled' }

export function EditorDndProvider({ children }: { children: React.ReactNode }) {
  const { locale, t } = useI18n()
  const [dragLabel, setDragLabel] = useState<string | null>(null)
  const [isPaletteDrag, setIsPaletteDrag] = useState(false)
  const reviewLocked = useAppStore(state => Boolean(state.activeChangeSet))
  const completedDrop = useRef<CompletedDropOutcome | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: defaultKeyboardCoordinateGetter }),
  )

  useEffect(() => {
    if (!reviewLocked) return
    completedDrop.current = { status: 'cancelled' }
    if (dragLabel !== null) {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
      }))
    }
    setDragLabel(null)
    setIsPaletteDrag(false)
  }, [dragLabel, reviewLocked])

  function handleDragStart(event: DragStartEvent) {
    if (useAppStore.getState().activeChangeSet) {
      completedDrop.current = { status: 'cancelled' }
      setDragLabel(null)
      setIsPaletteDrag(false)
      return
    }
    const drag = event.active.data.current
    completedDrop.current = null
    setDragLabel(isEditorDragData(drag) ? drag.label : null)
    setIsPaletteDrag(
      isEditorDragData(drag) &&
      (drag.type === 'palette' || drag.type === 'definitionPalette'),
    )
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragLabel(null)
    setIsPaletteDrag(false)
    const drag = event.active.data.current
    const target = event.over?.data.current
    if (!isEditorDragData(drag)) return
    if (!isComponentDropData(target)) {
      completedDrop.current = { status: 'cancelled' }
      return
    }

    const state = useAppStore.getState()
    if (state.activeChangeSet) {
      completedDrop.current = { status: 'cancelled' }
      return
    }
    const outcome = resolveEditorDrop(state.effectiveDocument, drag, target)
    completedDrop.current = outcome
    if (outcome.status === 'no-op') return
    if (outcome.status === 'invalid') {
      state.showToast({
        severity: 'error',
        message: { key: DROP_ERROR_KEYS[outcome.reason] },
      })
      return
    }

    if (drag.type === 'palette' || drag.type === 'definitionPalette') {
      if (outcome.action !== 'add') {
        completedDrop.current = { status: 'invalid', reason: 'domainValidation' }
        state.showToast({
          severity: 'error',
          message: { key: DROP_ERROR_KEYS.domainValidation },
        })
        return
      }
      const command = drag.type === 'palette'
        ? createAddComponentCommand(
            state.effectiveDocument,
            target.screenId,
            outcome.parentId,
            drag.kind,
            locale,
            outcome.position,
          )
        : {
            type: 'addDefinitionInstance' as const,
            componentId: `instance-${crypto.randomUUID()}`,
            screenId: target.screenId,
            parentId: target.parentId,
            position: outcome.position,
            definitionId: drag.definitionId,
            variantId: null,
            props: {},
            placement: DEFAULT_COMPONENT_PLACEMENT,
            sizing: DEFAULT_COMPONENT_SIZING,
          }
      if (!state.dispatch(command, `Add component: ${drag.kind}`)) {
        completedDrop.current = { status: 'invalid', reason: 'domainValidation' }
        useAppStore.getState().showToast({
          severity: 'error',
          message: { key: DROP_ERROR_KEYS.domainValidation },
        })
        return
      }
      useAppStore.getState().selectScreenComponent(command.componentId)
      return
    }

    if (outcome.action !== 'move') {
      completedDrop.current = { status: 'invalid', reason: 'domainValidation' }
      state.showToast({
        severity: 'error',
        message: { key: DROP_ERROR_KEYS.domainValidation },
      })
      return
    }
    if (!state.dispatch({
      type: 'moveComponent',
      componentId: drag.componentId,
      newParentId: target.parentId,
      position: outcome.position,
    }, `Move component: ${drag.label}`)) {
      completedDrop.current = { status: 'invalid', reason: 'domainValidation' }
      useAppStore.getState().showToast({
        severity: 'error',
        message: { key: DROP_ERROR_KEYS.domainValidation },
      })
      return
    }
    useAppStore.getState().selectScreenComponent(drag.componentId)
  }

  function handleDragCancel() {
    completedDrop.current = { status: 'cancelled' }
    setDragLabel(null)
    setIsPaletteDrag(false)
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
          onDragOver({ active, over }) {
            const drag = active.data.current
            const target = over?.data.current
            if (!isEditorDragData(drag) || !isComponentDropData(target)) return ''
            const outcome = resolveEditorDrop(
              useAppStore.getState().effectiveDocument,
              drag,
              target,
            )
            if (outcome.status === 'invalid') {
              return t('dnd.announcementOverInvalid', {
                label: target.label,
                reason: t(DROP_ERROR_KEYS[outcome.reason]),
              })
            }
            return t(
              outcome.status === 'no-op'
                ? 'dnd.announcementOverNoOp'
                : 'dnd.announcementOver',
              { label: target.label },
            )
          },
          onDragEnd({ active }) {
            const drag = active.data.current
            if (!isEditorDragData(drag)) return ''
            const outcome = completedDrop.current
            if (outcome?.status === 'invalid') return ''
            if (outcome?.status === 'moved') {
              return t(
                outcome.action === 'add'
                  ? 'dnd.announcementAdded'
                  : 'dnd.announcementMoved',
                { label: drag.label },
              )
            }
            if (outcome?.status === 'no-op') {
              return t('dnd.announcementNoOp', { label: drag.label })
            }
            return t('dnd.announcementCancel', { label: drag.label })
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
        const drag = collisionArguments.active.data.current
        if (!isEditorDragData(drag)) return []
        const compatibleContainers = collisionArguments.droppableContainers.filter(
          container => {
            const target = container.data.current
            return isComponentDropData(target) &&
              isDropSurfaceCompatible(drag, target)
          },
        )
        const compatibleArguments = {
          ...collisionArguments,
          droppableContainers: compatibleContainers,
        }
        if (collisionArguments.pointerCoordinates) {
          const directDrop = document
            .elementsFromPoint(
              collisionArguments.pointerCoordinates.x,
              collisionArguments.pointerCoordinates.y,
            )
            .map(element => element.closest<HTMLElement>('[data-editor-drop-id]'))
            .find((element): element is HTMLElement => {
              if (element === null) return false
              return compatibleContainers.some(
                container => String(container.id) === element.dataset.editorDropId,
              )
            })
          const directId = directDrop?.dataset.editorDropId
          if (directId) return [{ id: directId }]
        }
        const pointerCollisions = pointerWithin(compatibleArguments)
        if (pointerCollisions.length === 0) {
          return collisionArguments.pointerCoordinates
            ? []
            : closestCenter(compatibleArguments)
        }
        return pointerCollisions.sort((left, right) => {
          const depth = (id: string | number) => {
            let node = compatibleContainers.find(
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
      onDragCancel={handleDragCancel}
    >
      {children}
      <DragOverlay dropAnimation={isPaletteDrag ? null : undefined}>
        {dragLabel ? (
          <div className={styles.overlay} data-drag-overlay>
            {dragLabel}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
