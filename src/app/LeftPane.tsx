import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { ScreenList } from '../features/screens/ScreenList'
import { Palette } from '../features/palette/Palette'
import { StructureTree } from '../features/structure-tree/StructureTree'
import { useI18n } from '../i18n/I18nProvider'
import {
  DEFAULT_LEFT_PANE_SECTION_STATE,
  persistLeftPaneSectionState,
  resolveInitialLeftPaneSectionState,
} from './leftPanePreferences'
import type { LeftPaneSectionState } from './leftPanePreferences'
import styles from './LeftPane.module.css'

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

// Screens and Palette are collapsible so the user can shrink either one out of the
// way, but the Structure Tree always stays mounted and visible below them so the
// current screen's composition never disappears while browsing screens or the palette.
export function LeftPane() {
  const { t } = useI18n()
  const [sectionState, setSectionState] = useState<LeftPaneSectionState>(() =>
    resolveInitialLeftPaneSectionState(browserStorage()),
  )
  const screensContentId = useId()
  const paletteContentId = useId()

  useEffect(() => {
    persistLeftPaneSectionState(browserStorage(), sectionState)
  }, [sectionState])

  function toggleSection(key: keyof LeftPaneSectionState) {
    setSectionState(previous => ({
      ...DEFAULT_LEFT_PANE_SECTION_STATE,
      ...previous,
      [key]: !previous[key],
    }))
  }

  return (
    <div className={styles.root}>
      <DisclosureSection
        title={t('tabs.screens')}
        expanded={sectionState.screensExpanded}
        onToggle={() => toggleSection('screensExpanded')}
        contentId={screensContentId}
      >
        <ScreenList />
      </DisclosureSection>

      <DisclosureSection
        title={t('tabs.palette')}
        expanded={sectionState.paletteExpanded}
        onToggle={() => toggleSection('paletteExpanded')}
        contentId={paletteContentId}
      >
        <Palette />
      </DisclosureSection>

      <section className={styles.treeSection} aria-labelledby={`${screensContentId}-tree-heading`}>
        <h2 id={`${screensContentId}-tree-heading`} className={styles.treeHeading}>
          {t('tabs.structure')}
        </h2>
        <div className={styles.treeBody}>
          <StructureTree />
        </div>
      </section>
    </div>
  )
}

function DisclosureSection({
  title,
  expanded,
  onToggle,
  contentId,
  children,
}: {
  title: string
  expanded: boolean
  onToggle: () => void
  contentId: string
  children: ReactNode
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionHeading}>
        <button
          type="button"
          className={styles.sectionHeader}
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={onToggle}
        >
          <span>{title}</span>
          <span
            className={`${styles.chevron} ${expanded ? '' : styles.chevronCollapsed}`}
            aria-hidden="true"
          >
            ▾
          </span>
        </button>
      </h2>
      <div id={contentId} role="region" aria-label={title} className={styles.sectionBody} hidden={!expanded}>
        {children}
      </div>
    </section>
  )
}
