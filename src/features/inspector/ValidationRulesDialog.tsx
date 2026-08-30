import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { nanoid } from 'nanoid'
import { useAppStore } from '../../app/appStore'
import type { ValidationRulesEditorContext } from '../../domain/componentBehavior'
import type { ValidationRule } from '../../domain/model'
import { useI18n } from '../../i18n/I18nProvider'
import type { MessageKey } from '../../i18n/messages'
import { trapDialogFocus } from './dialogFocus'
import styles from './EventDialog.module.css'
import {
  useDialogDraftFieldsetFocus,
  useDialogReviewLock,
} from '../../app/reviewLock'
import { DialogReviewActions } from '../change-review/DialogReviewActions'

type RuleType = ValidationRule['type']
type DialogResult = 'cancelled' | 'saved'

const RULE_TYPES: RuleType[] = ['required', 'minLength', 'maxLength', 'pattern', 'email', 'custom']
const SINGLETON_TYPES = new Set<RuleType>(['required', 'email', 'minLength', 'maxLength'])

interface DraftRule {
  key: string
  id: string
  type: RuleType
  value: string
  description: string
  message: string
}

interface RuleFieldErrors {
  type?: string
  value?: string
  description?: string
  message?: string
}

interface ValidationRulesDialogProps {
  context: ValidationRulesEditorContext
  onErrorCountChange?(count: number): void
  onClose(result: DialogResult): void
}

function validationTypeKey(type: RuleType): MessageKey {
  return `behavior.validation.${type}`
}

function draftFromRule(rule: ValidationRule): DraftRule {
  return {
    key: nanoid(),
    id: rule.id,
    type: rule.type,
    value: 'value' in rule ? String(rule.value) : '',
    description: 'description' in rule ? rule.description : '',
    message: rule.message,
  }
}

function createDraftRule(existing: DraftRule[]): DraftRule {
  const usedTypes = new Set(existing.map(rule => rule.type))
  const type = RULE_TYPES.find(candidate => !usedTypes.has(candidate)) ?? 'custom'
  return { key: nanoid(), id: nanoid(), type, value: '0', description: '', message: '' }
}

function parseLengthValue(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function isValidPattern(value: string): boolean {
  try {
    new RegExp(value)
    return true
  } catch {
    return false
  }
}

function toValidationRule(draft: DraftRule): ValidationRule {
  const message = draft.message.trim()
  switch (draft.type) {
    case 'required':
      return { id: draft.id, type: 'required', message }
    case 'email':
      return { id: draft.id, type: 'email', message }
    case 'minLength':
      return { id: draft.id, type: 'minLength', value: parseLengthValue(draft.value) ?? 0, message }
    case 'maxLength':
      return { id: draft.id, type: 'maxLength', value: parseLengthValue(draft.value) ?? 0, message }
    case 'pattern':
      return { id: draft.id, type: 'pattern', value: draft.value.trim(), message }
    case 'custom':
      return { id: draft.id, type: 'custom', description: draft.description.trim(), message }
  }
}

function computeErrors(
  rules: DraftRule[],
  t: ReturnType<typeof useI18n>['t'],
): Map<string, RuleFieldErrors> {
  const errors = new Map<string, RuleFieldErrors>()
  function setError(key: string, field: keyof RuleFieldErrors, message: string) {
    const existing = errors.get(key) ?? {}
    if (!existing[field]) errors.set(key, { ...existing, [field]: message })
  }

  const seenSingletonTypes = new Set<RuleType>()
  const seenPatternValues = new Set<string>()
  const seenDescriptions = new Set<string>()
  let minRule: DraftRule | null = null
  let maxRule: DraftRule | null = null

  for (const rule of rules) {
    if (rule.message.trim().length === 0) {
      setError(rule.key, 'message', t('behavior.ruleMessageRequired'))
    }

    if (rule.type === 'minLength' || rule.type === 'maxLength') {
      if (parseLengthValue(rule.value) === null) {
        setError(rule.key, 'value', t('behavior.ruleValueRequired'))
      } else if (rule.type === 'minLength') {
        minRule = rule
      } else {
        maxRule = rule
      }
    }

    if (rule.type === 'pattern') {
      const normalized = rule.value.trim()
      if (normalized.length === 0) {
        setError(rule.key, 'value', t('behavior.rulePatternRequired'))
      } else if (!isValidPattern(normalized)) {
        setError(rule.key, 'value', t('behavior.rulePatternInvalid'))
      } else if (seenPatternValues.has(normalized)) {
        setError(rule.key, 'value', t('behavior.ruleDuplicatePattern'))
      } else {
        seenPatternValues.add(normalized)
      }
    }

    if (rule.type === 'custom') {
      const normalized = rule.description.trim()
      if (normalized.length === 0) {
        setError(rule.key, 'description', t('behavior.ruleDescriptionRequired'))
      } else if (seenDescriptions.has(normalized)) {
        setError(rule.key, 'description', t('behavior.ruleDuplicateCustom'))
      } else {
        seenDescriptions.add(normalized)
      }
    }

    if (SINGLETON_TYPES.has(rule.type)) {
      if (seenSingletonTypes.has(rule.type)) {
        setError(rule.key, 'type', t('behavior.ruleDuplicateType', { type: t(validationTypeKey(rule.type)) }))
      } else {
        seenSingletonTypes.add(rule.type)
      }
    }
  }

  if (minRule && maxRule) {
    const minValue = parseLengthValue(minRule.value)
    const maxValue = parseLengthValue(maxRule.value)
    if (minValue !== null && maxValue !== null && minValue > maxValue) {
      setError(minRule.key, 'value', t('behavior.ruleRangeConflict'))
      setError(maxRule.key, 'value', t('behavior.ruleRangeConflict'))
    }
  }

  return errors
}

export function ValidationRulesDialog({
  context,
  onErrorCountChange,
  onClose,
}: ValidationRulesDialogProps) {
  const { t } = useI18n()
  const dispatch = useAppStore(state => state.dispatch)
  const { reviewLocked, staleAfterReview } = useDialogReviewLock()
  const dialogRef = useRef<HTMLElement>(null)
  const addRuleRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const reviewNoticeId = useId()
  const draftLocked = reviewLocked || staleAfterReview
  const draftFieldsetFocus = useDialogDraftFieldsetFocus(draftLocked)
  const [rules, setRules] = useState<DraftRule[]>(() => context.rules.map(draftFromRule))
  const errors = computeErrors(rules, t)
  const canSubmit = errors.size === 0
  useEffect(() => {
    onErrorCountChange?.(errors.size)
  }, [errors.size, onErrorCountChange])

  function close() {
    onClose('cancelled')
  }

  function save() {
    if (reviewLocked || staleAfterReview || !canSubmit) return
    const saved = dispatch(
      {
        type: 'updateComponentSpec',
        componentId: context.componentId,
        patch: { config: { validationRules: rules.map(toValidationRule) } as never },
      },
      `${t('behavior.validationRulesTitle')}: ${context.label}`,
    )
    if (saved) onClose('saved')
  }

  function updateRule(index: number, partial: Partial<DraftRule>) {
    if (draftLocked) return
    setRules(current => current.map((rule, ruleIndex) =>
      ruleIndex === index ? { ...rule, ...partial } : rule,
    ))
  }

  function changeType(index: number, type: RuleType) {
    if (draftLocked) return
    setRules(current => current.map((rule, ruleIndex) => {
      if (ruleIndex !== index) return rule
      return { ...rule, type, value: rule.value || '0' }
    }))
  }

  function moveRule(index: number, offset: -1 | 1) {
    if (draftLocked) return
    setRules(current => {
      const destination = index + offset
      if (destination < 0 || destination >= current.length) return current
      const next = [...current]
      const [rule] = next.splice(index, 1)
      next.splice(destination, 0, rule)
      return next
    })
  }

  function addRule() {
    if (draftLocked) return
    setRules(current => [...current, createDraftRule(current)])
  }

  function removeRule(key: string, index: number) {
    if (draftLocked) return
    setRules(current => current.filter(candidate => candidate.key !== key))
    requestAnimationFrame(() => {
      const rows = dialogRef.current?.querySelectorAll<HTMLElement>('[data-validation-rule]')
      const nextRow = rows?.[Math.min(index, Math.max(0, (rows?.length ?? 1) - 1))]
      const target = nextRow?.querySelector<HTMLElement>('select, input, textarea')
        ?? addRuleRef.current
      target?.focus()
    })
  }

  return createPortal(
    (
    <div
      className={styles.backdrop}
      onMouseDown={event => {
        if (event.target === event.currentTarget) close()
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          close()
          return
        }
        if (event.key === 'Tab') trapDialogFocus(event, dialogRef.current)
      }}
    >
      <section
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-validation-dialog
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {t('behavior.validationRulesTitle')}
          </h2>
          <button
            type="button"
            className={styles.close}
            onClick={close}
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>
        <form
          onSubmit={formEvent => {
            formEvent.preventDefault()
            save()
          }}
        >
          {reviewLocked || staleAfterReview ? (
            <p
              id={reviewNoticeId}
              className={styles.reviewLockNotice}
              role={staleAfterReview ? 'alert' : 'status'}
            >
              {t(staleAfterReview ? 'changes.dialogDraftStale' : 'changes.dialogDraftLocked')}
            </p>
          ) : null}
          {reviewLocked ? <DialogReviewActions /> : null}
          <fieldset
            {...draftFieldsetFocus}
            className={styles.draftFields}
            disabled={draftLocked}
            aria-describedby={reviewLocked || staleAfterReview ? reviewNoticeId : undefined}
          >
          <div className={styles.actionHeading}>
            <h3>{t('behavior.validation')}</h3>
            <button
              ref={addRuleRef}
              type="button"
              className={styles.secondary}
              autoFocus
              onClick={addRule}
            >
              + {t('behavior.addRule')}
            </button>
          </div>
          {rules.length > 0 ? (
            <ol className={styles.actionList}>
              {rules.map((rule, index) => {
                const ruleErrors = errors.get(rule.key) ?? {}
                const controlId = (field: 'type' | 'value' | 'description' | 'message') =>
                  `${titleId}-${rule.key}-${field}`
                const errorId = (field: 'type' | 'value' | 'description' | 'message') =>
                  `${controlId(field)}-error`
                return (
                  <li
                    className={styles.actionCard}
                    key={rule.key}
                    data-validation-rule={index}
                  >
                    <div className={styles.actionPosition}>
                      <span>{index + 1}</span>
                      <div className={styles.reorderActions}>
                        <button
                          type="button"
                          className={styles.iconButton}
                          disabled={index === 0}
                          aria-label={t('behavior.moveRuleUp', { position: index + 1 })}
                          onClick={() => moveRule(index, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          disabled={index === rules.length - 1}
                          aria-label={t('behavior.moveRuleDown', { position: index + 1 })}
                          onClick={() => moveRule(index, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                    <div className={styles.ruleFields}>
                      <label className={styles.compactField}>
                        <span>{t('behavior.ruleType')}</span>
                        <select
                          id={controlId('type')}
                          value={rule.type}
                          aria-invalid={ruleErrors.type ? true : undefined}
                          aria-errormessage={ruleErrors.type ? errorId('type') : undefined}
                          onChange={event => changeType(index, event.target.value as RuleType)}
                        >
                          {RULE_TYPES.map(type => (
                            <option key={type} value={type}>{t(validationTypeKey(type))}</option>
                          ))}
                        </select>
                      </label>
                      {ruleErrors.type ? (
                        <p
                          id={errorId('type')}
                          className={styles.fieldError}
                          role="alert"
                        >
                          {ruleErrors.type}
                        </p>
                      ) : null}

                      {rule.type === 'minLength' || rule.type === 'maxLength' ? (
                        <label className={styles.compactField}>
                          <span>{t(validationTypeKey(rule.type))}</span>
                          <input
                            id={controlId('value')}
                            type="text"
                            inputMode="numeric"
                            value={rule.value}
                            aria-invalid={ruleErrors.value ? true : undefined}
                            aria-errormessage={ruleErrors.value ? errorId('value') : undefined}
                            onChange={event => updateRule(index, { value: event.target.value })}
                          />
                        </label>
                      ) : null}
                      {rule.type === 'pattern' ? (
                        <label className={styles.compactField}>
                          <span>{t('behavior.rulePatternValue')}</span>
                          <textarea
                            id={controlId('value')}
                            rows={2}
                            value={rule.value}
                            aria-invalid={ruleErrors.value ? true : undefined}
                            aria-errormessage={ruleErrors.value ? errorId('value') : undefined}
                            onChange={event => updateRule(index, { value: event.target.value })}
                          />
                        </label>
                      ) : null}
                      {ruleErrors.value ? (
                        <p
                          id={errorId('value')}
                          className={styles.fieldError}
                          role="alert"
                        >
                          {ruleErrors.value}
                        </p>
                      ) : null}

                      {rule.type === 'custom' ? (
                        <label className={styles.compactField}>
                          <span>{t('behavior.ruleCustomDescription')}</span>
                          <textarea
                            id={controlId('description')}
                            rows={2}
                            value={rule.description}
                            aria-invalid={ruleErrors.description ? true : undefined}
                            aria-errormessage={
                              ruleErrors.description ? errorId('description') : undefined
                            }
                            onChange={event => updateRule(index, { description: event.target.value })}
                          />
                        </label>
                      ) : null}
                      {ruleErrors.description ? (
                        <p
                          id={errorId('description')}
                          className={styles.fieldError}
                          role="alert"
                        >
                          {ruleErrors.description}
                        </p>
                      ) : null}

                      <label className={styles.compactField}>
                        <span>{t('behavior.ruleMessage')}</span>
                        <textarea
                          id={controlId('message')}
                          rows={2}
                          value={rule.message}
                          aria-invalid={ruleErrors.message ? true : undefined}
                          aria-errormessage={
                            ruleErrors.message ? errorId('message') : undefined
                          }
                          onChange={event => updateRule(index, { message: event.target.value })}
                        />
                      </label>
                      {ruleErrors.message ? (
                        <p
                          id={errorId('message')}
                          className={styles.fieldError}
                          role="alert"
                        >
                          {ruleErrors.message}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className={styles.removeAction}
                      aria-label={t('behavior.removeRule', { position: index + 1 })}
                      onClick={() => removeRule(rule.key, index)}
                    >
                      ×
                    </button>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className={styles.muted}>{t('behavior.noValidationRules')}</p>
          )}
          </fieldset>

          <div className={styles.actions}>
            <span className={styles.spacer} />
            <button type="button" className={styles.secondary} onClick={close}>
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className={styles.primary}
              disabled={reviewLocked || staleAfterReview || !canSubmit}
            >
              {t('common.save')}
            </button>
          </div>
        </form>
      </section>
    </div>
    ),
    document.body,
  )
}
