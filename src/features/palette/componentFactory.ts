import { nanoid } from 'nanoid'
import type { AddComponentCommand } from '../../domain/commands'
import type { ComponentConfig, ComponentKind, EntityId, ProjectDocument } from '../../domain/model'
import { DEFAULT_COMPONENT_LAYOUT } from '../../domain/model'
import type { Locale } from '../../i18n/messages'
import { translate } from '../../i18n/messages'

export interface PaletteItem {
  kind: Exclude<ComponentKind, 'page'>
}

export const PALETTE_ITEMS: PaletteItem[] = [
  { kind: 'section' },
  { kind: 'container' },
  { kind: 'text' },
  { kind: 'textInput' },
  { kind: 'select' },
  { kind: 'button' },
  { kind: 'alert' },
  { kind: 'modal' },
]

function generateUniqueFieldKey(doc: ProjectDocument): string {
  const usedKeys = new Set<string>()
  for (const component of Object.values(doc.components)) {
    if (component.config.kind === 'textInput' || component.config.kind === 'select') {
      const fieldKey = component.config.fieldKey.trim()
      if (fieldKey) usedKeys.add(fieldKey)
    }
  }

  let counter = 1
  while (usedKeys.has(`field_${counter}`)) counter += 1
  return `field_${counter}`
}

export function createDefaultComponentConfig(
  kind: PaletteItem['kind'],
  doc: ProjectDocument,
  locale: Locale,
): ComponentConfig {
  switch (kind) {
    case 'section':
    case 'container':
      return { kind, ...DEFAULT_COMPONENT_LAYOUT }
    case 'text':
      return { kind, text: translate(locale, 'defaults.text'), style: 'body' }
    case 'textInput':
      return {
        kind,
        fieldKey: generateUniqueFieldKey(doc),
        label: translate(locale, 'defaults.fieldLabel'),
        inputType: 'text',
        required: false,
        placeholder: '',
        defaultValue: '',
        validationRules: [],
        requestBinding: null,
      }
    case 'select':
      return {
        kind,
        fieldKey: generateUniqueFieldKey(doc),
        label: translate(locale, 'defaults.selectLabel'),
        required: false,
        options: [],
        defaultValue: '',
        requestBinding: null,
      }
    case 'button':
      return {
        kind,
        label: translate(locale, 'defaults.buttonLabel'),
        variant: 'primary',
        eventId: null,
        confirmationMessage: null,
        preventDoubleSubmit: false,
      }
    case 'alert':
      return { kind, tone: 'info', message: translate(locale, 'defaults.alertMessage') }
    case 'modal':
      return { kind, ...DEFAULT_COMPONENT_LAYOUT }
  }
}

export function createAddComponentCommand(
  doc: ProjectDocument,
  screenId: EntityId,
  parentId: EntityId | null,
  kind: PaletteItem['kind'],
  locale: Locale,
  position?: number,
): AddComponentCommand {
  return {
    type: 'addComponent',
    componentId: nanoid(),
    screenId,
    parentId,
    kind,
    config: createDefaultComponentConfig(kind, doc, locale),
    position,
  }
}
