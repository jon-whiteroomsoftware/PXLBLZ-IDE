export function uniquePatternName(base: string, existing: string[]): string {
  const lower = existing.map((n) => n.toLowerCase())
  if (!lower.includes(base.toLowerCase())) return base
  let i = 1
  while (lower.includes(`${base} ${i}`.toLowerCase())) i++
  return `${base} ${i}`
}

export function nameConflicts(candidate: string, takenNames: string[]): boolean {
  const c = candidate.toLowerCase()
  return takenNames.some((n) => n.toLowerCase() === c)
}
