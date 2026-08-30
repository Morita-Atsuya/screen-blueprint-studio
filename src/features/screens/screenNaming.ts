import type { Screen } from '../../domain/model'

export function findAvailableScreenDefaults(screens: Record<string, Screen>): {
  name: string
  route: string
} {
  const names = new Set(Object.values(screens).map(screen => screen.name))
  const routes = new Set(Object.values(screens).map(screen => screen.route))
  let suffix = 1

  while (true) {
    const name = `画面 ${suffix}`
    const route = `/画面-${suffix}`
    if (!names.has(name) && !routes.has(route)) return { name, route }
    suffix += 1
  }
}
