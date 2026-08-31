export const SAFE_EXTERNAL_URL_PATTERN =
  "^[Hh][Tt][Tt][Pp][Ss]?://(?:localhost|(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])|(?![0-9.]+(?=[:/?#]|$))(?=[^/:?#]*[A-Za-z])[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*)(?::(?:0|[1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5]))?(?:[/?#][^\\s\\u0000-\\u001F\\u007F\\\\]*)?$"

const safeExternalUrl = new RegExp(SAFE_EXTERNAL_URL_PATTERN)

function hasSafeHttpScheme(value: string): boolean {
  return safeExternalUrl.test(value)
}

function hasUnsafeUrlCharacters(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value) || value.includes('\\')
}

export function isSafeExternalUrl(value: string): boolean {
  return (
    value === value.trim() &&
    value.length > 0 &&
    !hasUnsafeUrlCharacters(value) &&
    hasSafeHttpScheme(value)
  )
}

export function isSafePortableUrl(value: string, allowEmpty = false): boolean {
  if (value !== value.trim()) return false
  if (value.length === 0) return allowEmpty
  if (hasUnsafeUrlCharacters(value) || value.startsWith('//')) return false
  if (hasSafeHttpScheme(value)) return true
  if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) {
    return true
  }
  return !/^[a-z][a-z0-9+.-]*:/i.test(value)
}
