import type { EntityId, ProjectDocument } from './model'
import type { DomainCommand } from './commands'

export interface ChangeSetOperation {
  id: EntityId
  source: 'human' | 'agent'
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
  reason: string
  rejectedAt: string
  operationCount: number
}
