export type DomainErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_PARENT'
  | 'INVALID_REFERENCE'
  | 'INVALID_ARGUMENT'
  | 'INVARIANT_VIOLATION'
  | 'REVISION_CONFLICT'
  | 'CHANGE_SET_REQUIRED'
  | 'CHANGE_SET_ALREADY_ACTIVE'
  | 'CHANGE_SET_NOT_ACTIVE'
  | 'INVALID_CHANGE_SET_SOURCE'
  | 'CANNOT_REMOVE_ROOT'
  | 'CANNOT_REMOVE_LAST_SCREEN'
  | 'SCREEN_REFERENCED_BY_NAVIGATE'
  | 'RECOVERY_REQUIRED'

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}
