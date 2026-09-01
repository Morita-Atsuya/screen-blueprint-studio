import type {
  ComponentLayout,
  ComponentPlacement,
  ComponentSizing,
} from './model'
import {
  COMPONENT_SIZE_TOKENS,
  ROOT_COMPONENT_SIZING,
} from './model'
import { DomainError } from './errors'

const sizeRank = new Map(COMPONENT_SIZE_TOKENS.map((token, index) => [token, index]))

export function validateComponentSizingValue(
  sizing: ComponentSizing,
  label = 'Component sizing',
): void {
  const min = sizeRank.get(sizing.minWidth)
  const max = sizeRank.get(sizing.maxWidth)
  if (min === undefined || max === undefined) {
    throw new DomainError('INVARIANT_VIOLATION', `${label} uses an invalid size token`)
  }
  if (sizing.minWidth !== 'none' && sizing.maxWidth !== 'none' && min > max) {
    throw new DomainError('INVARIANT_VIOLATION', `${label} minWidth must not exceed maxWidth`)
  }
  if (sizing.grow > 0 && (sizing.inlineSize !== 'fill' || sizing.shrink !== 'allow')) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `${label} grow requires inlineSize fill and shrink allow`,
    )
  }
}

export function validateSizingContext(
  sizing: ComponentSizing,
  placement: ComponentPlacement,
  parentLayout: ComponentLayout | null,
  label = 'Component sizing',
): void {
  validateComponentSizingValue(sizing, label)
  if (placement.mode !== 'flow') {
    if (sizing.gridSpan !== 1 || sizing.grow !== 0 || sizing.shrink !== 'allow') {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `${label} outside parent flow requires gridSpan 1, grow 0, and shrink allow`,
      )
    }
    return
  }
  if (!parentLayout || parentLayout.layout === 'vertical') {
    if (sizing.gridSpan !== 1 || sizing.grow !== 0 || sizing.shrink !== 'allow') {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `${label} in vertical flow requires gridSpan 1, grow 0, and shrink allow`,
      )
    }
    return
  }
  if (parentLayout.layout === 'grid') {
    if (
      sizing.gridSpan > parentLayout.columns ||
      sizing.grow !== 0 ||
      sizing.shrink !== 'allow'
    ) {
      throw new DomainError(
        'INVARIANT_VIOLATION',
        `${label} in grid flow requires gridSpan 1..${parentLayout.columns}, grow 0, and shrink allow`,
      )
    }
    return
  }
  if (sizing.gridSpan !== 1) {
    throw new DomainError(
      'INVARIANT_VIOLATION',
      `${label} in horizontal flow requires gridSpan 1`,
    )
  }
}

export function isRootSizing(sizing: ComponentSizing): boolean {
  return Object.keys(ROOT_COMPONENT_SIZING).every(key =>
    sizing[key as keyof ComponentSizing] === ROOT_COMPONENT_SIZING[key as keyof ComponentSizing])
}
