import {
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import type {
  ChangeEvent,
  CompositionEvent,
  FocusEvent,
  KeyboardEvent,
} from 'react'
import { useI18n } from '../i18n/I18nProvider'
import {
  shouldCommitTextKey,
  shouldPreserveTextDraftBlur,
} from './textDraft'
import styles from './DraftTextField.module.css'

interface CachedDraft {
  draft: string
  baseline: string
}

const draftCache = new Map<string, CachedDraft>()
const DRAFT_STORAGE_PREFIX = 'screen-blueprint-studio:text-draft:'

function storageKey(draftId: string): string {
  return `${DRAFT_STORAGE_PREFIX}${encodeURIComponent(draftId)}`
}

function loadStoredDraft(draftId: string): CachedDraft | undefined {
  try {
    const raw = window.sessionStorage.getItem(storageKey(draftId))
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Partial<CachedDraft>
    if (typeof parsed.draft !== 'string' || typeof parsed.baseline !== 'string') {
      window.sessionStorage.removeItem(storageKey(draftId))
      return undefined
    }
    return { draft: parsed.draft, baseline: parsed.baseline }
  } catch {
    return undefined
  }
}

function persistStoredDraft(draftId: string, draft: CachedDraft): void {
  try {
    window.sessionStorage.setItem(storageKey(draftId), JSON.stringify(draft))
  } catch {
    // The confirmed document is still safe; this only affects transient reload recovery.
  }
}

function clearDraft(draftId: string): void {
  draftCache.delete(draftId)
  try {
    window.sessionStorage.removeItem(storageKey(draftId))
  } catch {
    // Storage can be unavailable without blocking editing.
  }
}

interface DraftTextFieldProps {
  draftId: string
  value: string
  onCommit(value: string): boolean
  validate?(value: string): string | null
  className?: string
  ariaLabel: string
  multiline?: boolean
  rows?: number
  placeholder?: string
  disabled?: boolean
}

export function DraftTextField({
  draftId,
  value,
  onCommit,
  validate,
  className,
  ariaLabel,
  multiline = false,
  rows,
  placeholder,
  disabled = false,
}: DraftTextFieldProps) {
  const { t } = useI18n()
  const errorId = useId()
  const cached = useRef(draftCache.get(draftId) ?? loadStoredDraft(draftId))
  const [draft, setDraft] = useState(() => cached.current?.draft ?? value)
  const [baseline, setBaseline] = useState(() => cached.current?.baseline ?? value)
  const [dirty, setDirty] = useState(() => cached.current !== undefined && draft !== value)
  const dirtyRef = useRef(dirty)
  const composing = useRef(false)
  const draftSnapshot = useRef<CachedDraft>({ draft, baseline })
  draftSnapshot.current = { draft, baseline }
  dirtyRef.current = dirty

  const validationError = validate?.(draft) ?? null
  const externalChanged = dirty && value !== baseline
  const error = validationError ?? (
    externalChanged ? t('errors.draftChangedExternally') : null
  )

  useEffect(() => {
    if (!dirty || draft === value) {
      clearDraft(draftId)
      setDraft(value)
      setBaseline(value)
      setDirty(false)
      dirtyRef.current = false
    } else {
      draftCache.set(draftId, { draft, baseline })
    }
  }, [draft, draftId, dirty, value])

  useEffect(() => () => {
    if (dirtyRef.current) {
      persistStoredDraft(draftId, draftSnapshot.current)
    }
  }, [draftId])

  function commitDraft(): boolean {
    if (!dirty) return true
    if (validationError) return false
    if (draft === value) {
      clearDraft(draftId)
      setBaseline(value)
      setDirty(false)
      dirtyRef.current = false
      return true
    }
    const committed = onCommit(draft)
    if (committed) {
      clearDraft(draftId)
      setBaseline(draft)
      setDirty(false)
      dirtyRef.current = false
    }
    return committed
  }

  const commitRef = useRef(commitDraft)
  commitRef.current = commitDraft

  useEffect(() => {
    if (!dirty) return
    let flushed = false
    const flush = () => {
      if (flushed) return
      flushed = true
      if (!commitRef.current()) {
        persistStoredDraft(draftId, draftSnapshot.current)
      }
    }
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [dirty])

  function updateDraft(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const nextDraft = event.target.value
    setDraft(nextDraft)
    if (nextDraft === value) {
      clearDraft(draftId)
      setBaseline(value)
      setDirty(false)
      dirtyRef.current = false
      return
    }
    const nextBaseline = dirty ? baseline : value
    draftCache.set(draftId, { draft: nextDraft, baseline: nextBaseline })
    setBaseline(nextBaseline)
    setDirty(true)
    dirtyRef.current = true
  }

  function cancelDraft() {
    clearDraft(draftId)
    setDraft(value)
    setBaseline(value)
    setDirty(false)
    dirtyRef.current = false
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === 'Escape' && !composing.current && !event.nativeEvent.isComposing) {
      event.preventDefault()
      event.stopPropagation()
      cancelDraft()
      return
    }
    if (shouldCommitTextKey(
      event.key,
      multiline,
      composing.current || event.nativeEvent.isComposing,
    )) {
      event.preventDefault()
      event.stopPropagation()
      commitDraft()
    }
  }

  function handleCompositionStart(_event: CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) {
    composing.current = true
  }

  function handleCompositionEnd(_event: CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) {
    composing.current = false
  }

  function handleBlur(event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (shouldPreserveTextDraftBlur(event.currentTarget, event.relatedTarget)) return
    commitDraft()
  }

  const controlProps = {
    className,
    value: draft,
    placeholder,
    disabled,
    'aria-label': ariaLabel,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
    onChange: updateDraft,
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
  }

  return (
    <div className={styles.root} data-draft-id={draftId} data-dirty={dirty || undefined}>
      {multiline ? (
        <textarea {...controlProps} rows={rows} />
      ) : (
        <input {...controlProps} type="text" />
      )}
      {error ? <p id={errorId} className={styles.error} role="alert">{error}</p> : null}
    </div>
  )
}
