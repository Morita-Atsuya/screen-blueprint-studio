import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { nanoid } from 'nanoid'
import { useAppStore } from '../../app/appStore'
import type {
  ApiEditorContext,
  ApiEditorOperation,
} from '../../domain/componentBehavior'
import type { FieldBinding, HttpMethod } from '../../domain/model'
import {
  cloneComponentTargetRef,
  componentTargetRefKey,
  isComponentTargetRef,
} from '../../domain/componentTargets'
import { useI18n } from '../../i18n/I18nProvider'
import { trapDialogFocus } from './dialogFocus'
import styles from './EventDialog.module.css'
import {
  useDialogDraftFieldsetFocus,
  useDialogReviewLock,
} from '../../app/reviewLock'
import { DialogReviewActions } from '../change-review/DialogReviewActions'

type DialogMode = 'create' | 'edit'
type DialogResult = 'cancelled' | 'saved' | 'deleted'

interface DraftBinding {
  key: string
  value: FieldBinding
}

function bindingComponentId(binding: FieldBinding): string {
  if (binding.source.type === 'item') return `item:${binding.source.path}`
  if (binding.source.type === 'literal') {
    return `literal:${JSON.stringify(binding.source.value)}`
  }
  return binding.source.type === 'inline'
    ? binding.source.componentId
    : componentTargetRefKey(binding.source)
}

function bindingSourceControlValue(binding: FieldBinding): string {
  return isComponentTargetRef(binding.source)
    ? `component:${bindingComponentId(binding)}`
    : binding.source.type
}

function cloneBindingSource(binding: FieldBinding): FieldBinding['source'] {
  return isComponentTargetRef(binding.source)
    ? cloneComponentTargetRef(binding.source)
    : { ...binding.source }
}

interface ApiOperationDialogProps {
  mode: DialogMode
  operationId?: string
  editorOperation?: ApiEditorOperation
  context: ApiEditorContext
  onClose(result: DialogResult): void
}

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

export function ApiOperationDialog({
  mode,
  operationId,
  editorOperation,
  context,
  onClose,
}: ApiOperationDialogProps) {
  const { t } = useI18n()
  const { dispatch, requestHumanDelete } = useAppStore()
  const { reviewLocked, staleAfterReview } = useDialogReviewLock()
  const dialogRef = useRef<HTMLElement>(null)
  const addBindingRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const reviewNoticeId = useId()
  const operation = editorOperation?.operation
  const persistedOperationId = operation?.id ?? operationId
  const draftLocked = reviewLocked || staleAfterReview
  const draftFieldsetFocus = useDialogDraftFieldsetFocus(draftLocked)
  const [name, setName] = useState(operation?.name ?? t('behavior.newApiOperationName'))
  const [method, setMethod] = useState<HttpMethod>(operation?.method ?? 'GET')
  const [path, setPath] = useState(operation?.path ?? '/api/')
  const [successStateId, setSuccessStateId] = useState(operation?.successScenarioId ?? '')
  const [errorStateId, setErrorStateId] = useState(operation?.errorScenarioId ?? '')
  const [bindings, setBindings] = useState<DraftBinding[]>(() =>
    (operation?.requestBindings ?? []).map(value => ({
      key: nanoid(),
      value: { ...value },
    })),
  )
  const operationAvailable = (
    mode === 'create' ||
    context.operations.some(candidate => candidate.operation.id === persistedOperationId)
  )
  const componentIds = bindings
    .filter(binding => isComponentTargetRef(binding.value.source))
    .map(binding => bindingComponentId(binding.value))
  const targetPaths = bindings.map(binding => binding.value.targetPath.trim())
  const statesAvailable = [successStateId, errorStateId].every(stateId =>
    stateId === '' || context.states.some(state => state.id === stateId),
  )
  const canSubmit = (
    name.trim().length > 0 &&
    path.trim().length > 0 &&
    operationAvailable &&
    statesAvailable &&
    bindings.every(binding =>
      (
        binding.value.source.type === 'literal' ||
        (
          binding.value.source.type === 'item' &&
          Boolean(context.itemContext) &&
          binding.value.source.path.length > 0
        ) ||
        (
          isComponentTargetRef(binding.value.source) &&
          context.inputComponents.some(component =>
            component.id === bindingComponentId(binding.value))
        )
      ) &&
      binding.value.targetPath.trim().length > 0
    ) &&
    new Set(componentIds).size === componentIds.length &&
    new Set(targetPaths).size === targetPaths.length
  )
  const canAddBinding = bindings.length < 50
  function save() {
    if (reviewLocked || staleAfterReview || !canSubmit || (mode === 'edit' && !persistedOperationId)) return
    const requestBindings = bindings.map(binding => ({
      source: cloneBindingSource(binding.value),
      targetPath: binding.value.targetPath.trim(),
    }))
    const normalizedName = name.trim()
    const normalizedPath = path.trim()
    const common = {
      name: normalizedName,
      method,
      path: normalizedPath,
      requestBindings,
      successScenarioId: successStateId || null,
      errorScenarioId: errorStateId || null,
    }
    let saved: boolean
    if (mode === 'create') {
      saved = dispatch({
          type: 'bindApiOperation',
          operationId: nanoid(),
          screenId: context.screenId,
          ...common,
          successScenarioId: common.successScenarioId ?? undefined,
          errorScenarioId: common.errorScenarioId ?? undefined,
        }, `${t('behavior.addApiOperation')}: ${normalizedName}`)
    } else {
      if (!persistedOperationId) return
      saved = dispatch({
          type: 'updateApiOperation',
          operationId: persistedOperationId,
          ...common,
        }, `${t('behavior.editApiOperation')}: ${normalizedName}`)
    }
    if (saved) onClose('saved')
  }

  function remove() {
    if (!persistedOperationId) return
    requestHumanDelete(
      { type: 'removeApiOperation', operationId: persistedOperationId },
      `${t('behavior.deleteApiOperation')}: ${name.trim()}`,
      () => onClose('deleted'),
    )
  }

  function updateBinding(index: number, value: FieldBinding) {
    if (draftLocked) return
    setBindings(current => current.map((binding, bindingIndex) =>
      bindingIndex === index ? { ...binding, value } : binding,
    ))
  }

  function moveBinding(index: number, offset: -1 | 1) {
    if (draftLocked) return
    setBindings(current => {
      const destination = index + offset
      if (destination < 0 || destination >= current.length) return current
      const next = [...current]
      const [binding] = next.splice(index, 1)
      next.splice(destination, 0, binding)
      return next
    })
  }

  function addBinding() {
    if (draftLocked) return
    const used = new Set(bindings.map(binding => bindingComponentId(binding.value)))
    const component = context.inputComponents.find(candidate => !used.has(candidate.id))
      ?? context.inputComponents[0]
    const source: FieldBinding['source'] = context.itemContext
      ? { type: 'item', path: '/id' }
      : component
        ? cloneComponentTargetRef(component.target)
        : { type: 'literal', value: '' }
    setBindings(current => [
      ...current,
      {
        key: nanoid(),
        value: { source, targetPath: '' },
      },
    ])
  }

  function removeBinding(key: string, index: number) {
    if (draftLocked) return
    setBindings(current => current.filter(candidate => candidate.key !== key))
    requestAnimationFrame(() => {
      const rows = dialogRef.current?.querySelectorAll<HTMLElement>('[data-api-binding]')
      const nextRow = rows?.[Math.min(index, Math.max(0, (rows?.length ?? 1) - 1))]
      const target = nextRow?.querySelector<HTMLElement>('select, input')
        ?? addBindingRef.current
      target?.focus()
    })
  }

  return createPortal(
    (
    <div
      className={styles.backdrop}
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose('cancelled')
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onClose('cancelled')
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
        data-api-dialog={mode}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {t(mode === 'create'
              ? 'behavior.createApiOperationTitle'
              : 'behavior.editApiOperationTitle')}
          </h2>
          <button
            type="button"
            className={styles.close}
            onClick={() => onClose('cancelled')}
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>
        <form
          onSubmit={event => {
            event.preventDefault()
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
          <label className={styles.field}>
            <span>{t('behavior.apiName')}</span>
            <input
              autoFocus
              required
              value={name}
              onChange={event => setName(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>{t('behavior.apiMethod')}</span>
            <select
              value={method}
              onChange={event => setMethod(event.target.value as HttpMethod)}
            >
              {METHODS.map(candidate => (
                <option key={candidate} value={candidate}>{candidate}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>{t('behavior.apiPath')}</span>
            <input
              required
              value={path}
              onChange={event => setPath(event.target.value)}
            />
          </label>
          <div className={styles.stateFields}>
            <label className={styles.field}>
              <span>{t('behavior.successState')}</span>
              <StateSelect
                value={successStateId}
                context={context}
                onChange={setSuccessStateId}
              />
            </label>
            <label className={styles.field}>
              <span>{t('behavior.errorState')}</span>
              <StateSelect
                value={errorStateId}
                context={context}
                onChange={setErrorStateId}
              />
            </label>
          </div>

          <div className={styles.actionHeading}>
            <h3>{t('behavior.bindings')}</h3>
            <button
              ref={addBindingRef}
              type="button"
              className={styles.secondary}
              disabled={!canAddBinding}
              onClick={addBinding}
            >
              + {t('behavior.addBinding')}
            </button>
          </div>
          {bindings.length > 0 ? (
            <ol className={styles.actionList}>
              {bindings.map((binding, index) => {
                const usedByOther = new Set(bindings.flatMap((candidate, candidateIndex) =>
                  candidateIndex === index ||
                  !isComponentTargetRef(candidate.value.source)
                    ? []
                    : [bindingComponentId(candidate.value)],
                ))
                return (
                  <li
                    className={styles.actionCard}
                    key={binding.key}
                    data-api-binding={index}
                  >
                    <div className={styles.actionPosition}>
                      <span>{index + 1}</span>
                      <div className={styles.reorderActions}>
                        <button
                          type="button"
                          className={styles.iconButton}
                          disabled={index === 0}
                          aria-label={t('behavior.moveBindingUp', { position: index + 1 })}
                          onClick={() => moveBinding(index, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          disabled={index === bindings.length - 1}
                          aria-label={t('behavior.moveBindingDown', { position: index + 1 })}
                          onClick={() => moveBinding(index, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                    <div className={styles.actionFields}>
                      <label className={styles.compactField}>
                        <span>{t('behavior.bindingComponent')}</span>
                        <select
                          value={bindingSourceControlValue(binding.value)}
                          onChange={event => updateBinding(index, {
                            ...binding.value,
                            source: event.target.value === 'item'
                              ? { type: 'item', path: '/id' }
                              : event.target.value === 'literal'
                                ? { type: 'literal', value: '' }
                                : cloneComponentTargetRef(
                                    context.inputComponents.find(component =>
                                      `component:${component.id}` === event.target.value)?.target ??
                                      context.inputComponents[0]!.target,
                                  ),
                          })}
                        >
                          {isComponentTargetRef(binding.value.source) &&
                          !context.inputComponents.some(
                            component => component.id === bindingComponentId(binding.value),
                          ) ? (
                            <option value={bindingSourceControlValue(binding.value)}>
                              {t('behavior.missingReference', {
                                id: bindingComponentId(binding.value),
                              })}
                            </option>
                          ) : null}
                          {context.itemContext ? (
                            <option value="item">{t('behavior.bindingItem')}</option>
                          ) : null}
                          <option value="literal">{t('behavior.bindingLiteral')}</option>
                          {context.inputComponents.map(component => (
                            <option
                              key={component.id}
                              value={`component:${component.id}`}
                              disabled={usedByOther.has(component.id)}
                            >
                              {component.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {binding.value.source.type === 'item' ? (
                        <label className={styles.compactField}>
                          <span>{t('behavior.itemPath')}</span>
                          <input
                            required
                            value={binding.value.source.path}
                            onChange={event => updateBinding(index, {
                              ...binding.value,
                              source: { type: 'item', path: event.target.value },
                            })}
                          />
                        </label>
                      ) : null}
                      {binding.value.source.type === 'literal' ? (
                        <label className={styles.compactField}>
                          <span>{t('behavior.literalValue')}</span>
                          <input
                            value={binding.value.source.value === null
                              ? 'null'
                              : String(binding.value.source.value)}
                            onChange={event => updateBinding(index, {
                              ...binding.value,
                              source: { type: 'literal', value: event.target.value },
                            })}
                          />
                        </label>
                      ) : null}
                      <label className={styles.compactField}>
                        <span>{t('behavior.targetPath')}</span>
                        <input
                          required
                          value={binding.value.targetPath}
                          onChange={event => updateBinding(index, {
                            ...binding.value,
                            targetPath: event.target.value,
                          })}
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      className={styles.removeAction}
                      aria-label={t('behavior.removeBinding', { position: index + 1 })}
                      onClick={() => removeBinding(binding.key, index)}
                    >
                      ×
                    </button>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className={styles.muted}>{t('behavior.noBindings')}</p>
          )}

          {!operationAvailable ? (
            <p className={styles.unavailable} role="alert">
              {t('behavior.apiUnavailable')}
            </p>
          ) : null}
          </fieldset>

          <div className={styles.actions}>
            {mode === 'edit' ? (
              <button
                type="button"
                className={styles.dangerOutline}
                onClick={remove}
                disabled={reviewLocked || staleAfterReview}
                data-api-delete
              >
                {t('behavior.deleteApiOperation')}
              </button>
            ) : null}
            <span className={styles.spacer} />
            <button
              type="button"
              className={styles.secondary}
              onClick={() => onClose('cancelled')}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className={styles.primary}
              disabled={reviewLocked || staleAfterReview || !canSubmit}
            >
              {t(mode === 'create' ? 'behavior.addApiOperation' : 'common.save')}
            </button>
          </div>
        </form>
      </section>
    </div>
    ),
    document.body,
  )
}

function StateSelect({
  value,
  context,
  onChange,
}: {
  value: string
  context: ApiEditorContext
  onChange(value: string): void
}) {
  const { t } = useI18n()
  return (
    <select value={value} onChange={event => onChange(event.target.value)}>
      <option value="">{t('behavior.noState')}</option>
      {value && !context.states.some(state => state.id === value) ? (
        <option value={value}>
          {t('behavior.missingReference', { id: value })}
        </option>
      ) : null}
      {context.states.map(state => (
        <option key={state.id} value={state.id}>{state.label}</option>
      ))}
    </select>
  )
}
