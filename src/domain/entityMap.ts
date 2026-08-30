import { DomainError } from './errors'

const RESERVED_ENTITY_IDS = new Set([
  ...Object.getOwnPropertyNames(Object.prototype),
  '__proto__',
  'prototype',
  'constructor',
])

export function isSafeEntityId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !RESERVED_ENTITY_IDS.has(value)
}

export function requireSafeEntityId(value: unknown, path: string): asserts value is string {
  if (!isSafeEntityId(value)) {
    throw new DomainError('INVALID_REFERENCE', `${path} must be a safe, non-empty entity ID`)
  }
}

export function hasOwnEntity<T>(map: Record<string, T>, id: string): boolean {
  return isSafeEntityId(id) && Object.prototype.hasOwnProperty.call(map, id)
}

export function getOwnEntity<T>(map: Record<string, T>, id: string): T | undefined {
  return hasOwnEntity(map, id) ? map[id] : undefined
}

export function setOwnEntity<T>(map: Record<string, T>, id: string, entity: T): void {
  requireSafeEntityId(id, 'entity ID')
  Object.defineProperty(map, id, {
    configurable: true,
    enumerable: true,
    writable: true,
    value: entity,
  })
}

export function deleteOwnEntity<T>(map: Record<string, T>, id: string): boolean {
  if (!hasOwnEntity(map, id)) return false
  return delete map[id]
}
