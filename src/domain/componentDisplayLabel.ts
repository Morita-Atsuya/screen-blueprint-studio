import { getOwnEntity } from './entityMap'
import type { EntityId, ProjectDocument, ScreenComponent, ScreenState } from './model'
import type { EffectiveScreenComponent } from './selectors'
import { effectiveComponent } from './selectors'
import type { Locale, MessageKey } from '../i18n/messages'
import { translate } from '../i18n/messages'
import { assertNever } from './assertNever'

export const COMPONENT_KIND_MESSAGE_KEYS: Record<
  Extract<ScreenComponent, { nodeType: 'inline' }>['kind'],
  MessageKey
> = {
  page: 'component.page',
  container: 'component.container',
  text: 'component.text',
  textInput: 'component.textInput',
  select: 'component.select',
  button: 'component.button',
  image: 'component.image',
  link: 'component.link',
  modal: 'component.modal',
}

function readableText(value: string, fallback: string, maxLength = 32): string {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized) return fallback
  const characters = Array.from(normalized)
  if (characters.length <= maxLength) return normalized
  return `${characters.slice(0, maxLength - 1).join('')}…`
}

export function getComponentDisplayLabel(
  component: ScreenComponent | EffectiveScreenComponent,
  locale: Locale = 'en',
): string {
  if (component.nodeType === 'definitionInstance') {
    const base = 'definitionName' in component && typeof component.definitionName === 'string'
      ? component.definitionName
      : translate(locale, 'component.container')
    return readableText(base, base)
  }
  const fallback = translate(locale, COMPONENT_KIND_MESSAGE_KEYS[component.kind])
  const config = component.config
  switch (config.kind) {
    case 'page':
    case 'modal':
      return fallback
    case 'container':
      return readableText(component.common.description, fallback)
    case 'text':
      return readableText(config.text, fallback)
    case 'image':
      return readableText(config.alt, fallback)
    case 'textInput':
    case 'select':
    case 'button':
    case 'link':
      return readableText(config.label, fallback)
    default:
      return assertNever(config, 'component display label config')
  }
}

export function getComponentTreeLabel(
  component: ScreenComponent | EffectiveScreenComponent,
  locale: Locale = 'en',
): string {
  const label = getComponentDisplayLabel(component, locale)
  if (component.nodeType === 'definitionInstance') return label
  const config = component.config
  if (config.kind !== 'textInput' && config.kind !== 'select') return label
  const value = config.kind === 'select'
    ? config.options.find(option => option.value === config.defaultValue)?.label ?? config.defaultValue
    : config.defaultValue
  if (!value.trim()) return label
  return readableText(`${label}: ${value}`, label)
}

export function getComponentHierarchyLabel(
  document: ProjectDocument,
  component: ScreenComponent | EffectiveScreenComponent,
  locale: Locale = 'en',
): string {
  const screen = getOwnEntity(document.screens, component.screenId)
  const modalIndex = component.parentId === null && component.nodeType === 'inline' && component.kind === 'modal'
    ? screen?.modalComponentIds.indexOf(component.id) ?? -1
    : -1
  return modalIndex >= 0
    ? translate(locale, 'canvas.modalFrameLabel', { number: modalIndex + 1 })
    : getComponentDisplayLabel(component, locale)
}

export interface ComponentHierarchyItem {
  componentId: EntityId
  label: string
}

export interface ComponentSelectionContext {
  screenId: EntityId
  screenName: string
  targetLabel: string
  hierarchy: ComponentHierarchyItem[]
}

export function getComponentSelectionContext(
  document: ProjectDocument,
  componentId: EntityId,
  locale: Locale = 'en',
  activeState?: ScreenState,
): ComponentSelectionContext | null {
  const target = getOwnEntity(document.components, componentId)
  if (!target) return null
  const screen = getOwnEntity(document.screens, target.screenId)
  if (!screen) return null

  const reverseHierarchy: ScreenComponent[] = []
  const visited = new Set<EntityId>()
  let current: ScreenComponent | undefined = target
  while (current && !visited.has(current.id)) {
    reverseHierarchy.push(current)
    visited.add(current.id)
    current = current.parentId
      ? getOwnEntity(document.components, current.parentId)
      : undefined
  }

  const root = reverseHierarchy[reverseHierarchy.length - 1]
  if (
    !root ||
    (root.id !== screen.rootComponentId && !screen.modalComponentIds.includes(root.id))
  ) {
    return null
  }

  const hierarchy = reverseHierarchy.reverse().map(component => ({
    componentId: component.id,
    label: getComponentHierarchyLabel(
      document,
      effectiveComponent(document, component, activeState),
      locale,
    ),
  }))

  return {
    screenId: screen.id,
    screenName: readableText(screen.name, translate(locale, 'component.page'), 48),
    targetLabel: hierarchy[hierarchy.length - 1]!.label,
    hierarchy,
  }
}
