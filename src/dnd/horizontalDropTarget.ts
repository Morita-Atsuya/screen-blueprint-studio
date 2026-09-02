export interface ClientPoint {
  x: number
  y: number
}

export interface ClientRectBounds {
  left: number
  right: number
  top: number
  bottom: number
}

export function horizontalDropTargetAt<T>(
  point: ClientPoint,
  rect: ClientRectBounds,
  beforeTarget: T,
  afterTarget: T,
): T | null {
  if (
    point.x < rect.left ||
    point.x > rect.right ||
    point.y < rect.top ||
    point.y > rect.bottom
  ) {
    return null
  }
  return point.x < rect.left + (rect.right - rect.left) / 2
    ? beforeTarget
    : afterTarget
}

export function horizontalAfterDropPosition(
  childIds: readonly string[],
  flowChildIds: readonly string[],
  childId: string,
): number | null {
  const flowIndex = flowChildIds.indexOf(childId)
  if (flowIndex < 0) return null
  const nextFlowChildId = flowChildIds[flowIndex + 1]
  if (nextFlowChildId === undefined) return childIds.length
  const nextPosition = childIds.indexOf(nextFlowChildId)
  return nextPosition < 0 ? null : nextPosition
}

export function horizontalFlowDropIsNoOp(
  childIds: readonly string[],
  flowChildIds: readonly string[],
  componentId: string,
  dropPosition: number,
): boolean {
  const oldIndex = childIds.indexOf(componentId)
  if (
    oldIndex < 0 ||
    !flowChildIds.includes(componentId) ||
    dropPosition < 0 ||
    dropPosition > childIds.length
  ) {
    return false
  }
  const nextPosition = oldIndex < dropPosition ? dropPosition - 1 : dropPosition
  const reordered = [...childIds]
  reordered.splice(oldIndex, 1)
  reordered.splice(nextPosition, 0, componentId)
  const flowSet = new Set(flowChildIds)
  const nextFlowChildIds = reordered.filter(childId => flowSet.has(childId))
  return nextFlowChildIds.every((childId, index) => childId === flowChildIds[index])
}
