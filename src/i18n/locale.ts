import type { Locale } from './messages'

export const LOCALE_STORAGE_KEY = 'screen-blueprint-studio:locale:v1'

interface LocaleStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function resolveInitialLocale(
  storage: LocaleStorage | undefined,
  navigatorLanguage: string | undefined,
): Locale {
  try {
    const stored = storage?.getItem(LOCALE_STORAGE_KEY)
    if (stored === 'ja' || stored === 'en') return stored
  } catch {
    // Storage availability does not affect locale selection.
  }
  return navigatorLanguage?.toLowerCase().startsWith('ja') ? 'ja' : 'en'
}

export function persistLocale(
  storage: Pick<LocaleStorage, 'setItem'> | undefined,
  locale: Locale,
): boolean {
  try {
    storage?.setItem(LOCALE_STORAGE_KEY, locale)
    return storage !== undefined
  } catch {
    return false
  }
}
