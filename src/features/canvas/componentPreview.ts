import { assertNever } from '../../domain/assertNever'
import type { ComponentConfig, LinkDestination, LinkOpenMode, TextStyle } from '../../domain/model'
import { isSafePortableUrl } from '../../domain/portableUrl'

export type ImagePreviewStatus = 'ready' | 'missing' | 'invalid' | 'failed'

export function resolveImagePreviewStatus(
  source: string,
  failedSource: string | null,
): ImagePreviewStatus {
  if (source.length === 0) return 'missing'
  if (!isSafePortableUrl(source)) return 'invalid'
  return failedSource === source ? 'failed' : 'ready'
}

export type CanvasComponentPreview =
  | {
      kind: 'page' | 'container' | 'modal'
      rendersContent: false
    }
  | {
      kind: 'text'
      rendersContent: true
      element: 'h1' | 'h2' | 'h3' | 'p' | 'small'
      style: TextStyle
      text: string
    }
  | {
      kind: 'textInput'
      rendersContent: true
      label: string
      required: boolean
      inputType: 'text' | 'email' | 'password'
      placeholder: string
      value: string
    }
  | {
      kind: 'select'
      rendersContent: true
      label: string
      required: boolean
      options: Array<{ value: string; label: string }>
      value: string
    }
  | {
      kind: 'button'
      rendersContent: true
      label: string
      variant: 'primary' | 'secondary' | 'danger'
    }
  | {
      kind: 'image'
      rendersContent: true
      source: string
      alt: string
      fit: 'contain' | 'cover'
      aspectRatio: 'auto' | 'square' | '4:3' | '16:9'
      placeholderStyle: 'icon' | 'skeleton'
    }
  | {
      kind: 'link'
      rendersContent: true
      label: string
      destination: LinkDestination
      openMode: LinkOpenMode
    }

function textElement(style: TextStyle): 'h1' | 'h2' | 'h3' | 'p' | 'small' {
  switch (style) {
    case 'heading1':
      return 'h1'
    case 'heading2':
      return 'h2'
    case 'heading3':
      return 'h3'
    case 'body':
      return 'p'
    case 'caption':
      return 'small'
    default:
      return assertNever(style, 'Canvas text style')
  }
}

export function createCanvasComponentPreview(
  config: ComponentConfig,
): CanvasComponentPreview {
  switch (config.kind) {
    case 'page':
    case 'container':
    case 'modal':
      return { kind: config.kind, rendersContent: false }
    case 'text':
      return {
        kind: config.kind,
        rendersContent: true,
        element: textElement(config.style),
        style: config.style,
        text: config.text,
      }
    case 'textInput':
      return {
        kind: config.kind,
        rendersContent: true,
        label: config.label,
        required: config.required,
        inputType: config.inputType,
        placeholder: config.placeholder,
        value: config.defaultValue,
      }
    case 'select':
      return {
        kind: config.kind,
        rendersContent: true,
        label: config.label,
        required: config.required,
        options: config.options,
        value: config.defaultValue,
      }
    case 'button':
      return {
        kind: config.kind,
        rendersContent: true,
        label: config.label,
        variant: config.variant,
      }
    case 'image':
      return { ...config, rendersContent: true }
    case 'link':
      return {
        kind: config.kind,
        rendersContent: true,
        label: config.label,
        destination: { ...config.destination },
        openMode: config.openMode,
      }
    default:
      return assertNever(config, 'Canvas component config')
  }
}
