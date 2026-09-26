export function readWorkerCount(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
): number {
  const raw = env[name]
  if (raw === undefined) return fallback
  if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new Error(`${name} must be a positive integer, got "${raw}".`)
  }
  return Number(raw)
}

export function workerCountLine(
  label: string,
  env: Record<string, string | undefined>,
  name: string,
  count: number,
): string {
  return `${label} workers: ${count} (${env[name] === undefined ? 'default' : name})`
}
