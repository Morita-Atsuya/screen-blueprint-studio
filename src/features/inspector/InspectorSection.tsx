import { useId, useRef } from 'react'
import {
  clearPreservedTextDraftBlur,
  preserveTextDraftOnSectionToggle,
} from '../../components/textDraft'
import styles from './Inspector.module.css'

export interface InspectorSectionBadge {
  label: string
  text: string
  tone?: 'default' | 'attention' | 'agent'
}

export function InspectorSection({
  sectionId,
  title,
  expanded,
  badges = [],
  onToggle,
  children,
}: {
  sectionId: string
  title: string
  expanded: boolean
  badges?: InspectorSectionBadge[]
  onToggle(): void
  children: React.ReactNode
}) {
  const contentId = useId()
  const contentRef = useRef<HTMLDivElement>(null)

  function preserveDirtyDraft() {
    const draft = contentRef.current
      ?.querySelector<HTMLElement>('[data-dirty="true"] input, [data-dirty="true"] textarea')
    if (!draft) return
    preserveTextDraftOnSectionToggle(draft)
    setTimeout(() => clearPreservedTextDraftBlur(draft), 0)
  }

  return (
    <section className={styles.inspectorSection} data-inspector-section={sectionId}>
      <h3 className={styles.inspectorSectionHeading}>
        <button
          type="button"
          className={styles.inspectorSectionToggle}
          aria-expanded={expanded}
          aria-controls={contentId}
          onPointerDown={() => {
            preserveDirtyDraft()
          }}
          onMouseDown={preserveDirtyDraft}
          onClick={() => {
            preserveDirtyDraft()
            onToggle()
          }}
          data-preserve-text-draft="true"
          data-inspector-section-toggle={sectionId}
        >
          <span
            className={`${styles.inspectorSectionChevron} ${
              expanded ? '' : styles.inspectorSectionChevronCollapsed
            }`}
            aria-hidden="true"
          >
            ▾
          </span>
          <span className={styles.inspectorSectionTitle}>{title}</span>
          {badges.length > 0 ? (
            <span className={styles.inspectorSectionBadges}>
              {badges.map((badge, index) => (
                <span
                  key={`${badge.label}:${index}`}
                  className={`${styles.inspectorSectionBadge} ${
                    badge.tone === 'agent'
                      ? styles.inspectorSectionBadgeAgent
                      : badge.tone === 'attention'
                        ? styles.inspectorSectionBadgeAttention
                        : ''
                  }`}
                  aria-label={badge.label}
                  title={badge.label}
                >
                  {badge.text}
                </span>
              ))}
            </span>
          ) : null}
        </button>
      </h3>
      <div
        ref={contentRef}
        id={contentId}
        className={styles.inspectorSectionBody}
        role="region"
        aria-label={title}
        hidden={!expanded}
      >
        {children}
      </div>
    </section>
  )
}
