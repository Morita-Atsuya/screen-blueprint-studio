import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import type { ToastSeverity, ToastState } from './toastModel'
import { TOAST_AUTO_DISMISS_MS } from './toastModel'
import styles from './App.module.css'

const SEVERITY_ICONS: Record<ToastSeverity, string> = {
  info: 'i',
  success: '✓',
  error: '!',
}

export function Toast({
  toast,
  dismiss,
  runAction,
}: {
  toast: ToastState | null
  dismiss(toastId: string): void
  runAction(toastId: string): void
}) {
  const { t, formatMessage } = useI18n()
  const announcement = toast ? (
    <>
      {t(`toast.severity.${toast.severity}`)}: {formatMessage(toast.message)}
    </>
  ) : null

  return (
    <>
      <div className={styles.visuallyHidden} role="status" aria-atomic="true">
        {toast?.severity !== 'error' ? announcement : null}
      </div>
      <div className={styles.visuallyHidden} role="alert" aria-atomic="true">
        {toast?.severity === 'error' ? announcement : null}
      </div>
      {toast ? (
        <ToastCard
          key={toast.id}
          toast={toast}
          dismiss={dismiss}
          runAction={runAction}
        />
      ) : null}
    </>
  )
}

function ToastCard({
  toast,
  dismiss,
  runAction,
}: {
  toast: ToastState
  dismiss(toastId: string): void
  runAction(toastId: string): void
}) {
  const { t, formatMessage } = useI18n()
  const rootRef = useRef<HTMLDivElement>(null)
  const wasFocusedWithinRef = useRef(false)
  const [hovered, setHovered] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const paused = hovered || focusWithin

  useEffect(() => {
    if (paused) return
    const timer = window.setTimeout(
      () => dismiss(toast.id),
      TOAST_AUTO_DISMISS_MS[toast.severity],
    )
    return () => window.clearTimeout(timer)
  }, [dismiss, paused, toast.id, toast.severity])

  useLayoutEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const node = rootRef.current
    return () => {
      if (
        wasFocusedWithinRef.current &&
        (node?.contains(document.activeElement) || document.activeElement === document.body) &&
        returnFocus?.isConnected &&
        returnFocus !== document.body
      ) {
        returnFocus.focus({ preventScroll: true })
      }
    }
  }, [])

  const severityLabel = t(`toast.severity.${toast.severity}`)

  return (
    <div
      key={toast.id}
      ref={rootRef}
      className={styles.toast}
      data-toast-id={toast.id}
      data-toast-severity={toast.severity}
      data-toast-paused={paused || undefined}
      role="group"
      aria-label={severityLabel}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => {
        wasFocusedWithinRef.current = true
        setFocusWithin(true)
      }}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocusWithin(false)
        }
      }}
    >
      <span className={styles.toastIcon} aria-hidden="true">
        {SEVERITY_ICONS[toast.severity]}
      </span>
      <span className={styles.toastMessage}>
        <span className={styles.visuallyHidden}>{severityLabel}: </span>
        {formatMessage(toast.message)}
      </span>
      {toast.action ? (
        <button
          className={styles.toastAction}
          type="button"
          onClick={() => runAction(toast.id)}
        >
          {formatMessage(toast.action.label)}
        </button>
      ) : null}
      <button
        className={styles.toastClose}
        aria-label={t('common.close')}
        title={t('common.close')}
        onClick={() => dismiss(toast.id)}
        type="button"
      >
        ×
      </button>
    </div>
  )
}
