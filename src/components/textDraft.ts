export function shouldCommitTextKey(
  key: string,
  multiline: boolean,
  isComposing: boolean,
): boolean {
  return key === 'Enter' && !multiline && !isComposing
}
