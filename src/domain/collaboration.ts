import type { EntityId, ProjectDocument } from './model'
import type { DomainCommand } from './commands'
import { DomainError } from './errors'

export interface ChangeSetOperation {
  id: EntityId
  source: 'agent'
  command: DomainCommand
  issuedAt: string
}

export interface ChangeSet {
  id: EntityId
  summary: string
  baseRevision: number
  version: number
  baseDocument: ProjectDocument
  operations: ChangeSetOperation[]
  createdAt: string
}

export interface RejectedChangeSetRecord {
  changeSetId: EntityId
  summary: string
  baseRevision: number
  rejectedAt: string
  operationCount: number
  operationSummaries: string[]
}

export function assertAgentChangeSetOperations(
  operations: readonly ChangeSetOperation[],
): void {
  const invalidOperation = operations.find(
    operation => (operation as { source: unknown }).source !== 'agent',
  )
  if (!invalidOperation) return
  throw new DomainError(
    'INVALID_CHANGE_SET_SOURCE',
    'Active change sets may only contain AI operations',
    {
      operationId: invalidOperation.id,
      source: (invalidOperation as { source: unknown }).source,
    },
  )
}
