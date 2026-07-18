export type ShowLogicalRouting =
  | { kind: 'single'; zoneIds: [string] }
  | { kind: 'grid'; zoneIds: string[]; columns: number; rows: number }
  | { kind: 'stripes'; zoneIds: string[]; axis: 'x' | 'y' }
  | { kind: 'checker'; zoneIds: [string, string]; columns: number; rows: number }
  | { kind: 'rings'; zoneIds: string[]; rings: number }
  | { kind: 'wave'; zoneIds: string[]; axis: 'x' | 'y'; bands: number; amplitude: number; frequency: number; phase: number }
  | { kind: 'split'; zoneIds: [string, string]; axis: 'x' | 'y' }
  | { kind: 'soft-split'; zoneIds: [string, string]; axis: 'x' | 'y'; feather: number }
  | { kind: 'pinwheel'; zoneIds: string[]; arms?: number; twist: number; rotation?: number }

export interface ShowLogicalRoutePoint {
  zoneId: string
  localX: number
  localY: number
  /** Weight of the second Zone, present only for blended ownership. */
  mix?: number
}

export function validateShowLogicalRouting(routing: ShowLogicalRouting): string[] {
  const label = logicalRoutingLabel(routing.kind)
  const issues: string[] = []
  const positiveInteger = (value: number) => Number.isInteger(value) && value >= 1
  if (routing.zoneIds.length === 0) issues.push(`${label} needs at least one Zone.`)
  if (routing.kind === 'single' && routing.zoneIds.length !== 1) issues.push('Full Surface needs exactly one Zone.')
  if (routing.kind === 'grid') {
    if (!positiveInteger(routing.columns) || !positiveInteger(routing.rows)) {
      issues.push('Grid columns and rows must be positive whole numbers.')
    } else if (routing.zoneIds.length !== routing.columns * routing.rows) {
      issues.push('Grid needs one Zone per cell.')
    }
  }
  if (routing.kind === 'checker') {
    if (routing.zoneIds.length !== 2) issues.push('Checker needs exactly two Zones.')
    if (!positiveInteger(routing.columns) || !positiveInteger(routing.rows)) {
      issues.push('Checker columns and rows must be positive whole numbers.')
    }
  }
  if (routing.kind === 'rings' && !positiveInteger(routing.rings)) {
    issues.push('Rings count must be a positive whole number.')
  }
  if (routing.kind === 'wave') {
    if (!positiveInteger(routing.bands)) issues.push('Wave band count must be a positive whole number.')
    if (!Number.isFinite(routing.amplitude) || routing.amplitude < 0 || routing.amplitude > 1) {
      issues.push('Wave amplitude must be between 0 and 1.')
    }
    if (!Number.isFinite(routing.frequency) || routing.frequency < 0 || !Number.isFinite(routing.phase)) {
      issues.push('Wave frequency must be finite and non-negative, and phase must be finite.')
    }
  }
  if (routing.kind === 'split' && routing.zoneIds.length !== 2) issues.push('Moving Split needs exactly two Zones.')
  if (routing.kind === 'soft-split') {
    if (routing.zoneIds.length !== 2) issues.push('Soft Split needs exactly two Zones.')
    if (!Number.isFinite(routing.feather) || routing.feather < 0 || routing.feather > 1) {
      issues.push('Soft Split feather must be between 0 and 1.')
    }
  }
  if (routing.kind === 'pinwheel') {
    if (routing.arms !== undefined && !positiveInteger(routing.arms)) {
      issues.push('Pinwheel arm count must be a positive whole number.')
    }
    if (!Number.isFinite(routing.twist) || !Number.isFinite(routing.rotation ?? 0)) {
      issues.push('Pinwheel twist and rotation must be finite.')
    }
  }
  return issues
}

export function routeShowLogicalPoint(
  routing: ShowLogicalRouting,
  x: number,
  y: number,
  parameters: { splitPosition?: number } = {},
): ShowLogicalRoutePoint {
  const stageX = clamp01(x)
  const stageY = clamp01(y)
  if (routing.kind === 'single') {
    return { zoneId: routing.zoneIds[0], localX: stageX, localY: stageY }
  }
  if (routing.kind === 'grid') {
    const columns = positiveInteger(routing.columns)
    const rows = positiveInteger(routing.rows)
    const column = boundedCell(stageX, columns)
    const row = boundedCell(stageY, rows)
    const zoneId = routing.zoneIds[row * columns + column]
    if (!zoneId) throw new Error('Show grid routing requires one zone per grid cell.')
    return {
      zoneId,
      localX: localCellCoordinate(stageX, column, columns),
      localY: localCellCoordinate(stageY, row, rows),
    }
  }
  if (routing.kind === 'stripes') {
    requireZones(routing.zoneIds, routing.kind)
    const coordinate = routing.axis === 'x' ? stageX : stageY
    const stripe = boundedCell(coordinate, routing.zoneIds.length)
    const local = localCellCoordinate(coordinate, stripe, routing.zoneIds.length)
    return {
      zoneId: routing.zoneIds[stripe],
      localX: routing.axis === 'x' ? local : stageX,
      localY: routing.axis === 'y' ? local : stageY,
    }
  }
  if (routing.kind === 'checker') {
    const columns = positiveInteger(routing.columns)
    const rows = positiveInteger(routing.rows)
    const column = boundedCell(stageX, columns)
    const row = boundedCell(stageY, rows)
    return {
      zoneId: routing.zoneIds[(row + column) % 2],
      localX: localCellCoordinate(stageX, column, columns),
      localY: localCellCoordinate(stageY, row, rows),
    }
  }
  if (routing.kind === 'rings') {
    requireZones(routing.zoneIds, routing.kind)
    const rings = positiveInteger(routing.rings)
    const dx = stageX - 0.5
    const dy = stageY - 0.5
    const radius = clamp01(Math.hypot(dx, dy) / Math.SQRT1_2)
    const ring = boundedCell(radius, rings)
    return {
      zoneId: routing.zoneIds[ring % routing.zoneIds.length],
      localX: positiveFraction(Math.atan2(dy, dx) / (Math.PI * 2)),
      localY: localCellCoordinate(radius, ring, rings),
    }
  }
  if (routing.kind === 'wave') {
    requireZones(routing.zoneIds, routing.kind)
    const bands = positiveInteger(routing.bands)
    const along = routing.axis === 'x' ? stageX : stageY
    const across = routing.axis === 'x' ? stageY : stageX
    const displaced = positiveFraction(
      along + (triangle(across * routing.frequency + routing.phase) - 0.5) * routing.amplitude,
    )
    const band = boundedCell(displaced, bands)
    const local = localCellCoordinate(displaced, band, bands)
    return {
      zoneId: routing.zoneIds[band % routing.zoneIds.length],
      localX: routing.axis === 'x' ? local : stageX,
      localY: routing.axis === 'y' ? local : stageY,
    }
  }
  if (routing.kind === 'soft-split') {
    const position = clamp01(parameters.splitPosition ?? 0.5)
    const coordinate = routing.axis === 'x' ? stageX : stageY
    const signed = coordinate - position
    const mix = routing.feather <= 0 ? Number(signed >= 0) : clamp01(0.5 + signed / routing.feather)
    return {
      zoneId: routing.zoneIds[mix < 0.5 ? 0 : 1],
      localX: stageX,
      localY: stageY,
      mix,
    }
  }
  if (routing.kind === 'split') {
    const position = clamp01(parameters.splitPosition ?? 0.5)
    const coordinate = routing.axis === 'x' ? stageX : stageY
    const first = position >= 1 || (position > 0 && coordinate < position)
    const local = first
      ? coordinate / Math.max(position, Number.EPSILON)
      : (coordinate - position) / Math.max(1 - position, Number.EPSILON)
    return {
      zoneId: routing.zoneIds[first ? 0 : 1],
      localX: routing.axis === 'x' ? clamp01(local) : stageX,
      localY: routing.axis === 'y' ? clamp01(local) : stageY,
    }
  }

  requireZones(routing.zoneIds, routing.kind)
  const arms = positiveInteger(routing.arms ?? routing.zoneIds.length)
  const dx = stageX - 0.5
  const dy = stageY - 0.5
  const radius = Math.hypot(dx, dy)
  const turn = positiveFraction((Math.atan2(dy, dx) + radius * routing.twist + (routing.rotation ?? 0)) / (Math.PI * 2))
  const arm = boundedCell(turn, arms)
  return {
    zoneId: routing.zoneIds[arm % routing.zoneIds.length],
    localX: localCellCoordinate(turn, arm, arms),
    localY: clamp01(radius / Math.SQRT1_2),
  }
}

function boundedCell(coordinate: number, count: number): number {
  return Math.min(count - 1, Math.floor(coordinate * count))
}

function localCellCoordinate(coordinate: number, cell: number, count: number): number {
  return clamp01(coordinate * count - cell)
}

function positiveFraction(value: number): number {
  return value - Math.floor(value)
}

function triangle(value: number): number {
  const phase = positiveFraction(value)
  return phase < 0.5 ? phase * 2 : 2 - phase * 2
}

function positiveInteger(value: number): number {
  if (!Number.isInteger(value) || value < 1) throw new Error('Show logical routing dimensions must be positive integers.')
  return value
}

function requireZones(zoneIds: string[], kind: string): void {
  if (zoneIds.length === 0) throw new Error(`Show ${kind} routing requires at least one zone.`)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function logicalRoutingLabel(kind: ShowLogicalRouting['kind']): string {
  if (kind === 'single') return 'Full Surface'
  if (kind === 'soft-split') return 'Soft Split'
  return kind[0].toUpperCase() + kind.slice(1)
}
