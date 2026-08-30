import { nanoid } from 'nanoid'
import type { AddComponentCommand } from '../../domain/commands'
import type { ComponentConfig, ComponentKind, EntityId, ProjectDocument } from '../../domain/model'

export interface PaletteItem {
  kind: Exclude<ComponentKind, 'page'>
  label: string
}

export const PALETTE_ITEMS: PaletteItem[] = [
  { kind: 'section', label: 'Section' },
  { kind: 'stack', label: 'Stack' },
  { kind: 'columns', label: 'Columns' },
  { kind: 'actionArea', label: 'Action Area' },
  { kind: 'heading', label: 'Heading' },
  { kind: 'text', label: 'Text' },
  { kind: 'textInput', label: 'Text Input' },
  { kind: 'select', label: 'Select' },
  { kind: 'button', label: 'Button' },
  { kind: 'alert', label: 'Alert' },
  { kind: 'modal', label: 'Modal' },
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
): ComponentConfig {
  switch (kind) {
    case 'section':
      return { kind, title: '新しいセクション' }
    case 'stack':
      return { kind, gap: 'md' }
    case 'columns':
      return { kind, columns: 2 }
    case 'actionArea':
      return { kind, align: 'end' }
    case 'heading':
      return { kind, text: '見出し', level: 2 }
    case 'text':
      return { kind, text: 'テキスト' }
    case 'textInput':
      return {
        kind,
        fieldKey: generateUniqueFieldKey(doc),
        label: '項目名',
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
        label: '選択肢',
        required: false,
        options: [],
        requestBinding: null,
      }
    case 'button':
      return {
        kind,
        label: 'ボタン',
        variant: 'primary',
        eventId: null,
        confirmationMessage: null,
        preventDoubleSubmit: false,
      }
    case 'alert':
      return { kind, tone: 'info', message: 'メッセージ' }
    case 'modal':
      return { kind, title: 'モーダル' }
  }
}

export function createAddComponentCommand(
  doc: ProjectDocument,
  screenId: EntityId,
  parentId: EntityId,
  kind: PaletteItem['kind'],
  position?: number,
): AddComponentCommand {
  return {
    type: 'addComponent',
    componentId: nanoid(),
    screenId,
    parentId,
    kind,
    name: kind,
    config: createDefaultComponentConfig(kind, doc),
    position,
  }
}
