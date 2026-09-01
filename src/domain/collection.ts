import type {
  CollectionComponentConfig,
  CollectionValueSource,
  EntityId,
  JsonObject,
  JsonValue,
  PublicPropValue,
} from './model'
import { DomainError } from './errors'

export const MAX_COLLECTION_PREVIEW_ITEMS = 20
export const MAX_COLLECTION_PREVIEW_DEPTH = 8
export const MAX_COLLECTION_PREVIEW_BYTES = 32_768

export interface JsonPointerResult {
  found: boolean
  value?: JsonValue
}

export function parseJsonPointer(pointer: string, label = 'JSON Pointer'): string[] {
  if (pointer === '') return []
  if (!pointer.startsWith('/')) {
    throw new DomainError('INVARIANT_VIOLATION', `${label} must be empty or start with /`)
  }
  return pointer.slice(1).split('/').map(token => {
    if (/~(?:[^01]|$)/.test(token)) {
      throw new DomainError('INVARIANT_VIOLATION', `${label} has an invalid escape`)
    }
    return token.replace(/~1/g, '/').replace(/~0/g, '~')
  })
}

export function resolveJsonPointer(
  value: JsonValue,
  pointer: string,
  label = 'JSON Pointer',
): JsonPointerResult {
  const tokens = parseJsonPointer(pointer, label)
  let current: JsonValue = value
  for (const token of tokens) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(token)) return { found: false }
      const index = Number(token)
      if (index >= current.length) return { found: false }
      current = current[index]!
      continue
    }
    if (
      typeof current !== 'object' ||
      current === null ||
      !Object.prototype.hasOwnProperty.call(current, token)
    ) {
      return { found: false }
    }
    current = current[token]!
  }
  return { found: true, value: current }
}

function validateJsonValue(value: JsonValue, depth: number, label: string): void {
  if (depth > MAX_COLLECTION_PREVIEW_DEPTH) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `${label} exceeds preview depth ${MAX_COLLECTION_PREVIEW_DEPTH}`,
    )
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new DomainError('INVARIANT_VIOLATION', `${label} contains a non-finite number`)
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateJsonValue(entry, depth + 1, `${label}[${index}]`))
    return
  }
  if (typeof value === 'object' && value !== null) {
    Object.entries(value).forEach(([key, entry]) => {
      if (key.length === 0) {
        throw new DomainError('INVARIANT_VIOLATION', `${label} contains an empty key`)
      }
      validateJsonValue(entry, depth + 1, `${label}.${key}`)
    })
  }
}

export function validateCollectionPreviewItems(items: JsonObject[], label: string): void {
  if (items.length > MAX_COLLECTION_PREVIEW_ITEMS) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `${label} exceeds ${MAX_COLLECTION_PREVIEW_ITEMS} preview items`,
    )
  }
  if (new TextEncoder().encode(JSON.stringify(items)).length > MAX_COLLECTION_PREVIEW_BYTES) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `${label} exceeds ${MAX_COLLECTION_PREVIEW_BYTES} preview bytes`,
    )
  }
  items.forEach((item, index) => validateJsonValue(item, 1, `${label}[${index}]`))
}

export function resolveCollectionValue(
  item: JsonObject,
  source: CollectionValueSource,
  label: string,
): JsonPointerResult {
  return source.type === 'literal'
    ? { found: true, value: source.value }
    : resolveJsonPointer(item, source.path, label)
}

export function collectionItemKey(
  item: JsonObject,
  itemKeyPath: string,
  label: string,
): string {
  const result = resolveJsonPointer(item, itemKeyPath, label)
  if (!result.found) {
    throw new DomainError('INVARIANT_VIOLATION', `${label} does not resolve`)
  }
  if (typeof result.value !== 'string' && typeof result.value !== 'number') {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `${label} must resolve to a string or number`,
    )
  }
  return String(result.value)
}

export function resolveCollectionItem(
  config: CollectionComponentConfig,
  item: JsonObject,
): {
  itemKey: string
  props: Record<string, PublicPropValue>
  variantId: EntityId | null
  visible: boolean
} {
  const props = { ...config.itemTemplate.props }
  for (const binding of config.propBindings) {
    const result = resolveCollectionValue(
      item,
      binding.source,
      `Collection prop ${binding.propKey}`,
    )
    if (!result.found) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Collection prop ${binding.propKey} source is missing`,
      )
    }
    if (
      typeof result.value !== 'string' &&
      typeof result.value !== 'number' &&
      typeof result.value !== 'boolean'
    ) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `Collection prop ${binding.propKey} must resolve to a non-null scalar`,
      )
    }
    props[binding.propKey] = result.value
  }

  const matchingVariant = config.variantSelection.cases.find(rule => {
    const result = resolveCollectionValue(item, rule.source, 'Collection Variant rule')
    return result.found && result.value === rule.equals
  })
  const variantId = matchingVariant?.variantId ??
    config.variantSelection.fallbackVariantId ??
    config.itemTemplate.variantId

  let visible = true
  if (config.visibility) {
    const result = resolveCollectionValue(item, config.visibility.source, 'Collection visibility')
    visible = result.found && result.value === config.visibility.equals
      ? config.visibility.visibleWhenMatched
      : config.visibility.fallback
  }

  return {
    itemKey: collectionItemKey(item, config.itemKeyPath, 'Collection itemKeyPath'),
    props,
    variantId,
    visible,
  }
}
