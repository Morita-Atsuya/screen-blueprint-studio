export function parseExactTrueFlag(value: string | undefined): boolean {
  return value === 'true'
}

export const BUILD_FEATURE_FLAGS = Object.freeze({
  sampleReset: parseExactTrueFlag(import.meta.env?.VITE_ENABLE_SAMPLE_RESET),
})
