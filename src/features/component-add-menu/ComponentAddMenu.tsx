import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../../app/appStore'
import type { EntityId } from '../../domain/model'
import { getOwnEntity } from '../../domain/entityMap'
import { getComponentDisplayLabel } from '../../domain/componentDisplayLabel'
import { COMPONENT_KIND_MESSAGE_KEYS } from '../../domain/componentDisplayLabel'
import { useI18n } from '../../i18n/I18nProvider'
import { createAddComponentCommand } from '../palette/componentFactory'
import {
  clampContextMenuPosition,
  contextMenuPaletteItems,
  isComponentMenuKey,
  resolveComponentInsertTargets,
} from './componentAddMenuModel'
import type { ComponentInsertPlacement, ComponentInsertTarget, MenuPoint } from './componentAddMenuModel'
import styles from './ComponentAddMenu.module.css'

interface OpenMenu {
  componentId: EntityId
  trigger: HTMLElement
  anchor: MenuPoint
  stage: 'position' | 'kind'
  target: ComponentInsertTarget | null
}

export interface ComponentAddMenuTrigger {
  openFromPointer(event: MouseEvent<HTMLElement>, componentId: EntityId): void
  openFromKeyboard(event: KeyboardEvent<HTMLElement>, componentId: EntityId): boolean
}

export interface ComponentAddMenuController {
  trigger: ComponentAddMenuTrigger
  menu: ReactNode
  isOpen: boolean
}

const placementKeys: Record<ComponentInsertPlacement, 'componentMenu.inside' | 'componentMenu.before' | 'componentMenu.after'> = {
  inside: 'componentMenu.inside',
  before: 'componentMenu.before',
  after: 'componentMenu.after',
}

function menuItems(menu: HTMLElement): HTMLButtonElement[] {
  return Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'))
}

export function useComponentAddMenu(): ComponentAddMenuController {
  const { locale, t } = useI18n()
  const effectiveDocument = useAppStore(state => state.effectiveDocument)
  const dispatch = useAppStore(state => state.dispatch)
  const setSelectedComponent = useAppStore(state => state.setSelectedComponent)
  const [openMenu, setOpenMenu] = useState<OpenMenu | null>(null)
  const [position, setPosition] = useState<MenuPoint | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const close = useCallback((restoreFocus = true) => {
    const trigger = openMenu?.trigger
    setOpenMenu(null)
    setPosition(null)
    if (restoreFocus && trigger?.isConnected) {
      requestAnimationFrame(() => trigger.focus())
    }
  }, [openMenu])

  const openAt = useCallback((
    componentId: EntityId,
    trigger: HTMLElement,
    anchor: MenuPoint,
  ) => {
    setPosition(null)
    setOpenMenu({ componentId, trigger, anchor, stage: 'position', target: null })
  }, [])

  const trigger = useMemo<ComponentAddMenuTrigger>(() => ({
    openFromPointer(event, componentId) {
      event.preventDefault()
      event.stopPropagation()
      openAt(componentId, event.currentTarget, { x: event.clientX, y: event.clientY })
    },
    openFromKeyboard(event, componentId) {
      if (!isComponentMenuKey(event.key, event.shiftKey)) return false
      event.preventDefault()
      event.stopPropagation()
      const focused = event.target instanceof HTMLElement ? event.target : event.currentTarget
      const rect = focused.getBoundingClientRect()
      openAt(componentId, focused, { x: rect.left, y: rect.bottom })
      return true
    },
  }), [openAt])

  const component = openMenu
    ? getOwnEntity(effectiveDocument.components, openMenu.componentId)
    : undefined
  const targets = openMenu
    ? resolveComponentInsertTargets(effectiveDocument, openMenu.componentId)
    : []
  const label = component ? getComponentDisplayLabel(component, locale) : ''

  useEffect(() => {
    if (openMenu && !component) close(false)
  }, [close, component, openMenu])

  useLayoutEffect(() => {
    if (!openMenu || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    setPosition(clampContextMenuPosition(
      openMenu.anchor,
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
    ))
  }, [openMenu])

  useLayoutEffect(() => {
    if (!openMenu || !position || !menuRef.current) return
    menuItems(menuRef.current)[0]?.focus()
  }, [openMenu, position])

  function chooseTarget(target: ComponentInsertTarget) {
    setPosition(null)
    setOpenMenu(current => current
      ? { ...current, stage: 'kind', target }
      : current)
  }

  function returnToPositions() {
    setPosition(null)
    setOpenMenu(current => current
      ? { ...current, stage: 'position', target: null }
      : current)
  }

  function addComponent(kind: ReturnType<typeof contextMenuPaletteItems>[number]['kind']) {
    if (!openMenu?.target) return
    const command = createAddComponentCommand(
      effectiveDocument,
      openMenu.target.screenId,
      openMenu.target.parentId,
      kind,
      locale,
      openMenu.target.position,
    )
    if (!dispatch(command, t('componentMenu.historyLabel', {
      kind: t(COMPONENT_KIND_MESSAGE_KEYS[kind]),
    }))) return
    setSelectedComponent(command.componentId)
    close()
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    }
    if (event.key === 'ArrowLeft' && openMenu?.stage === 'kind') {
      event.preventDefault()
      event.stopPropagation()
      returnToPositions()
      return
    }

    const items = menuItems(event.currentTarget)
    if (items.length === 0) return
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
    if ((event.key === 'Enter' || event.key === ' ') && currentIndex >= 0) {
      event.preventDefault()
      event.stopPropagation()
      items[currentIndex].click()
      return
    }
    let nextIndex: number | null = null
    if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey)) {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length
    } else if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)) {
      nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = items.length - 1
    }
    if (nextIndex === null) return
    event.preventDefault()
    event.stopPropagation()
    items[nextIndex]?.focus()
  }

  const menu = openMenu && component
    ? createPortal(
        <div
          className={styles.backdrop}
          onPointerDown={event => {
            if (event.target === event.currentTarget) close()
          }}
          onContextMenu={event => {
            event.preventDefault()
            if (event.target === event.currentTarget) close()
          }}
        >
          <div
            ref={menuRef}
            className={styles.menu}
            role="menu"
            aria-label={t('componentMenu.label', { label })}
            data-component-add-menu
            data-menu-stage={openMenu.stage}
            style={{
              left: position?.x ?? openMenu.anchor.x,
              top: position?.y ?? openMenu.anchor.y,
              visibility: position ? 'visible' : 'hidden',
            }}
            onKeyDown={handleMenuKeyDown}
            onPointerDown={event => event.stopPropagation()}
          >
            <div className={styles.heading}>
              {t(openMenu.stage === 'position'
                ? 'componentMenu.choosePosition'
                : 'componentMenu.chooseType')}
            </div>
            {openMenu.stage === 'position'
              ? targets.map(target => (
                  <button
                    key={target.placement}
                    type="button"
                    role="menuitem"
                    className={styles.item}
                    data-insert-placement={target.placement}
                    onClick={() => chooseTarget(target)}
                  >
                    {t(placementKeys[target.placement])}
                  </button>
                ))
              : (
                  <>
                    {contextMenuPaletteItems().map(item => (
                      <button
                        key={item.kind}
                        type="button"
                        role="menuitem"
                        className={styles.item}
                        data-insert-kind={item.kind}
                        onClick={() => addComponent(item.kind)}
                      >
                        {t(COMPONENT_KIND_MESSAGE_KEYS[item.kind])}
                      </button>
                    ))}
                    <div className={styles.separator} role="separator" />
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.item}
                      onClick={returnToPositions}
                    >
                      {t('componentMenu.back')}
                    </button>
                  </>
                )}
          </div>
        </div>,
        document.body,
      )
    : null

  return { trigger, menu, isOpen: openMenu !== null }
}
