import { applyCommandWithoutRevision } from './applyCommand'
import type { ChangeSet, ChangeSetOperation } from './collaboration'
import type { ProjectDocument } from './model'

export interface ChangeSetOperationSnapshot {
  operation: ChangeSetOperation
  before: ProjectDocument
  after: ProjectDocument
}

export function replayChangeSetOperations(
  baseDocument: ProjectDocument,
  operations: ChangeSetOperation[],
): ProjectDocument {
  let current = baseDocument
  for (const operation of operations) {
    current = applyCommandWithoutRevision(current, operation.command)
  }
  return current
}

export function getChangeSetOperationSnapshots(
  changeSet: ChangeSet,
): ChangeSetOperationSnapshot[] {
  const snapshots: ChangeSetOperationSnapshot[] = []
  let before = changeSet.baseDocument
  for (const operation of changeSet.operations) {
    const after = applyCommandWithoutRevision(before, operation.command)
    snapshots.push({ operation, before, after })
    before = after
  }
  return snapshots
}
