import type { Screen } from '../../domain/model'
import type { Locale } from '../../i18n/messages'
import { translate } from '../../i18n/messages'

export function findAvailableScreenDefaults(screens: Record<string, Screen>, locale: Locale): {
  name: string
  route: string
} {
  const names = new Set(Object.values(screens).map(screen => screen.name))
  const routes = new Set(Object.values(screens).map(screen => screen.route))
  let suffix = 1

  while (true) {
    const name = translate(locale, 'screens.defaultName', { number: suffix })
    const route = `/screen-${suffix}`
    if (!names.has(name) && !routes.has(route)) return { name, route }
    suffix += 1
  }
}
