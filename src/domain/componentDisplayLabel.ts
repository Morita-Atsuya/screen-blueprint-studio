import type { ScreenComponent } from './model'
import type { Locale, MessageKey } from '../i18n/messages'
import { translate } from '../i18n/messages'

export const COMPONENT_KIND_MESSAGE_KEYS: Record<ScreenComponent['kind'], MessageKey> = {
  page: 'component.page',
  section: 'component.section',
  container: 'component.container',
  text: 'component.text',
  textInput: 'component.textInput',
  select: 'component.select',
  button: 'component.button',
  alert: 'component.alert',
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
  component: ScreenComponent,
  locale: Locale = 'en',
): string {
  const fallback = translate(locale, COMPONENT_KIND_MESSAGE_KEYS[component.kind])
  const config = component.config

  switch (config.kind) {
    case 'page':
    case 'section':
    case 'modal':
    case 'container':
      return fallback
    case 'text':
      return readableText(config.text, fallback)
    case 'textInput':
    case 'select':
    case 'button':
      return readableText(config.label, fallback)
    case 'alert':
      return readableText(config.message, fallback)
  }
}
