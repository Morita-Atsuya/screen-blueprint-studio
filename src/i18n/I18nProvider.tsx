import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { MessageKey, MessageParams, UiMessage } from './messages'
import { translate } from './messages'
import type { Locale } from './messages'
import { persistLocale, resolveInitialLocale } from './locale'

interface I18nContextValue {
  locale: Locale
  setLocale(locale: Locale): void
  t(key: MessageKey, params?: MessageParams): string
  formatMessage(message: UiMessage): string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function initialLocale(): Locale {
  return resolveInitialLocale(browserStorage(), globalThis.navigator?.language)
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale(nextLocale) {
      setLocaleState(nextLocale)
      persistLocale(browserStorage(), nextLocale)
    },
    t(key, params) {
      return translate(locale, key, params)
    },
    formatMessage(message) {
      return translate(locale, message.key, message.params)
    },
  }), [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}
