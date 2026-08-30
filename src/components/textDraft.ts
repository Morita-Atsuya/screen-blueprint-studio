export function shouldCommitTextKey(
  key: string,
  multiline: boolean,
  isComposing: boolean,
): boolean {
  return key === 'Enter' && !multiline && !isComposing
}

let preservedBlurTarget: EventTarget | null = null

export function preserveTextDraftOnSectionToggle(target: EventTarget): void {
  preservedBlurTarget = target
}

export function clearPreservedTextDraftBlur(target: EventTarget): void {
  if (preservedBlurTarget === target) preservedBlurTarget = null
}

export function shouldPreserveTextDraftBlur(
  target: EventTarget,
  relatedTarget: EventTarget | null,
): boolean {
  const targetsSectionToggle =
    relatedTarget instanceof HTMLElement &&
    relatedTarget.dataset.preserveTextDraft === 'true'
  if (!targetsSectionToggle && preservedBlurTarget !== target) return false
  preservedBlurTarget = null
  return true
}
