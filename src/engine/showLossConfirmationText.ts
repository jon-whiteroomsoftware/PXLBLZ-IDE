export function formatControlNameList(names: readonly string[], conjunction: 'and' | 'or'): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} ${conjunction} ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, ${conjunction} ${names[names.length - 1]}`
}

export function describePatternReplacementCost(lost: ReadonlyArray<{ animated: boolean }>): string | undefined {
  if (lost.length === 0) return undefined
  const animated = lost.filter(control => control.animated).length
  const values = lost.length - animated
  const parts = [
    animated > 0 ? `${animated} property lane${animated === 1 ? '' : 's'}` : undefined,
    values > 0 ? `${values} control value${values === 1 ? '' : 's'}` : undefined,
  ].filter((part): part is string => part !== undefined)
  return `removes ${parts.join(', ')}`
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

export function describeConnectedClipMoveLoss(transitionCount: number): { title: string; description: string; actionLabel: string } {
  const transitions = transitionCount === 1
    ? 'its connected Transition'
    : `its ${transitionCount} connected Transitions`
  return {
    title: 'Move connected Clip?',
    description: `Moving this Clip to another Layer also removes ${transitions}. Other Clip durations and positions stay unchanged.`,
    actionLabel: `Move Clip and remove Transition${transitionCount === 1 ? '' : 's'}`,
  }
}

export function describeControlTargetRemovalLoss(
  labels: ReadonlyArray<string>,
): { title: string; description: string; actionLabel: string } {
  if (labels.length === 1) {
    return {
      title: `Remove ${labels[0]} control?`,
      description: `The ${labels[0]} animation will be removed.`,
      actionLabel: `Remove ${labels[0]}`,
    }
  }
  return {
    title: `Remove ${labels.length} controls?`,
    description: `The ${formatControlNameList(labels, 'and')} animations will be removed.`,
    actionLabel: 'Remove controls',
  }
}
