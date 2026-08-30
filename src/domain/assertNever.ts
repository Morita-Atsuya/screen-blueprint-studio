export function assertNever(value: never, context: string): never {
  throw new Error(`Unsupported ${context}: ${JSON.stringify(value)}`)
}
