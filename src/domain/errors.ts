export type DomainErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_PARENT'
  | 'INVALID_REFERENCE'
  | 'INVARIANT_VIOLATION'
  | 'REVISION_CONFLICT'
  | 'CHANGE_SET_REQUIRED'
  | 'CHANGE_SET_ALREADY_ACTIVE'
  | 'CHANGE_SET_NOT_ACTIVE'
  | 'CANNOT_REMOVE_ROOT'
  | 'CANNOT_REMOVE_LAST_SCREEN'
  | 'SCREEN_REFERENCED_BY_NAVIGATE'
  | 'ENTRY_SCREEN_REQUIRED'
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
