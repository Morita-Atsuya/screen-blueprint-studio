import type { UiMessage } from '../i18n/messages'

export type ToastSeverity = 'info' | 'success' | 'error'

export interface ToastAction {
  label: UiMessage
  callback(): void
}

export interface ToastInput {
  severity: ToastSeverity
  message: UiMessage
  action?: ToastAction
}

export interface ToastState extends ToastInput {
  id: string
}

export const TOAST_AUTO_DISMISS_MS: Record<ToastSeverity, number> = {
  info: 5_000,
  success: 5_000,
  error: 8_000,
}
