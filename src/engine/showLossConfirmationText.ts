export function formatControlNameList(names: readonly string[], conjunction: 'and' | 'or'): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} ${conjunction} ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, ${conjunction} ${names[names.length - 1]}`
}

export function describePatternReplacementLoss(
  patternName: string,
  lost: ReadonlyArray<{ label: string; animated: boolean }>,
): { title: string; description: string; actionLabel: string } {
  const names = lost.map(control => control.label)
  const animated = lost.filter(control => control.animated).map(control => control.label)
  const values = lost.filter(control => !control.animated).map(control => control.label)
  const subject = `${patternName} doesn't have the ${formatControlNameList(names, 'or')} control${names.length === 1 ? '' : 's'}.`
  const animationText = animated.length > 0
    ? `the ${formatControlNameList(animated, 'and')} animation${animated.length === 1 ? '' : 's'}`
    : ''
  const valueText = values.length > 0
    ? `the ${formatControlNameList(values, 'and')} value${values.length === 1 ? '' : 's'}`
    : ''
  const removed = [animationText, valueText].filter(Boolean).join(' and ')
  return {
    title: `Use ${patternName}?`,
    description: `${subject} The ${removed.slice(4)} will be removed.`,
    actionLabel: `Use ${patternName}`,
  }
}
