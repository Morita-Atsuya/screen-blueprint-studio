import type { ScreenComponent } from './model'

const KIND_LABELS: Record<ScreenComponent['kind'], string> = {
  page: 'ページ',
  section: 'セクション',
  stack: '縦並び',
  columns: 'カラム',
  actionArea: '操作エリア',
  heading: '見出し',
  text: 'テキスト',
  textInput: 'テキスト入力',
  select: '選択肢',
  button: 'ボタン',
  alert: 'アラート',
  modal: 'モーダル',
}

function readableText(value: string, fallback: string, maxLength = 32): string {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized) return fallback

  const characters = Array.from(normalized)
  if (characters.length <= maxLength) return normalized
  return `${characters.slice(0, maxLength - 1).join('')}…`
}

export function deriveComponentDisplayName(
  component: ScreenComponent,
  screenName?: string,
): string {
  const fallback = KIND_LABELS[component.kind]
  const config = component.config

  switch (config.kind) {
    case 'page':
      return readableText(config.title, readableText(screenName ?? '', fallback))
    case 'section':
    case 'modal':
      return readableText(config.title, fallback)
    case 'heading':
    case 'text':
      return readableText(config.text, fallback)
    case 'textInput':
    case 'select':
    case 'button':
      return readableText(config.label, fallback)
    case 'alert':
      return readableText(config.message, fallback)
    case 'stack':
    case 'columns':
    case 'actionArea':
      return fallback
  }
}
