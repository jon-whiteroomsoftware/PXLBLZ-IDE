export type ShowLogicalRouting =
  | { kind: 'single'; zoneIds: [string] }
  | { kind: 'grid'; zoneIds: string[]; columns: number; rows: number }
  | { kind: 'stripes'; zoneIds: string[]; axis: 'x' | 'y' }
  | { kind: 'pinwheel'; zoneIds: string[]; twist: number }

export interface ShowLogicalRoutePoint {
  zoneId: string
  localX: number
  localY: number
}

export function routeShowLogicalPoint(
  routing: ShowLogicalRouting,
  x: number,
  y: number,
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

  requireZones(routing.zoneIds, routing.kind)
  const dx = stageX - 0.5
  const dy = stageY - 0.5
  const radius = Math.hypot(dx, dy)
  const turn = positiveFraction((Math.atan2(dy, dx) + radius * routing.twist) / (Math.PI * 2))
  const arm = boundedCell(turn, routing.zoneIds.length)
  return {
    zoneId: routing.zoneIds[arm],
    localX: localCellCoordinate(turn, arm, routing.zoneIds.length),
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
