export type ShowSpatialOperator =
  | { kind: 'grid'; columns: number; rows: number }
  | { kind: 'stripes'; axis: 'x' | 'y'; count: number; phase?: number }
  | { kind: 'checker'; columns: number; rows: number }
  | { kind: 'rings'; count: number }
  | { kind: 'pinwheel'; arms: number; twist: number; rotation?: number }
  | { kind: 'wave'; axis: 'x' | 'y'; count: number; amplitude: number; frequency: number; phase?: number }
  | { kind: 'soft-split'; axis: 'x' | 'y'; position: number; feather: number }

export interface ShowSpatialSample {
  region: number
  localX: number
  localY: number
  /** Weight of the alternate Pattern at this point. */
  mix: number
  /** Normalized distance to the nearest operator boundary. */
  boundary: number
}

export function sampleShowSpatialOperator(
  operator: ShowSpatialOperator,
  x: number,
  y: number,
  time: number,
): ShowSpatialSample {
  const stageX = clamp01(x)
  const stageY = clamp01(y)
  if (operator.kind === 'grid') {
    const columns = positiveInteger(operator.columns)
    const rows = positiveInteger(operator.rows)
    const column = boundedCell(stageX, columns)
    const row = boundedCell(stageY, rows)
    const localX = localCell(stageX, column, columns)
    const localY = localCell(stageY, row, rows)
    const region = row * columns + column
    return hardSample(region, localX, localY)
  }
  if (operator.kind === 'stripes') {
    const count = positiveInteger(operator.count)
    const coordinate = positiveFraction((operator.axis === 'x' ? stageX : stageY) + (operator.phase ?? 0) + time)
    const stripe = boundedCell(coordinate, count)
    const local = localCell(coordinate, stripe, count)
    return hardSample(stripe, operator.axis === 'x' ? local : stageX, operator.axis === 'y' ? local : stageY)
  }
  if (operator.kind === 'checker') {
    const columns = positiveInteger(operator.columns)
    const rows = positiveInteger(operator.rows)
    const column = boundedCell(stageX, columns)
    const row = boundedCell(stageY, rows)
    return hardSample(
      (row + column) % 2,
      localCell(stageX, column, columns),
      localCell(stageY, row, rows),
    )
  }
  if (operator.kind === 'rings') {
    const count = positiveInteger(operator.count)
    const dx = stageX - 0.5
    const dy = stageY - 0.5
    const radius = clamp01(Math.hypot(dx, dy) / Math.SQRT1_2)
    const ring = boundedCell(radius, count)
    const angle = positiveFraction(Math.atan2(dy, dx) / (Math.PI * 2))
    return hardSample(ring, angle, localCell(radius, ring, count))
  }
  if (operator.kind === 'pinwheel') {
    const arms = positiveInteger(operator.arms)
    const dx = stageX - 0.5
    const dy = stageY - 0.5
    const radius = Math.hypot(dx, dy)
    const turn = positiveFraction(
      Math.atan2(dy, dx) / (Math.PI * 2)
      + radius * operator.twist
      + (operator.rotation ?? 0)
      + time,
    )
    const arm = boundedCell(turn, arms)
    return hardSample(arm, localCell(turn, arm, arms), clamp01(radius / Math.SQRT1_2))
  }
  if (operator.kind === 'wave') {
    const count = positiveInteger(operator.count)
    const along = operator.axis === 'x' ? stageX : stageY
    const across = operator.axis === 'x' ? stageY : stageX
    const displaced = positiveFraction(
      along
      + (triangle(across * operator.frequency + (operator.phase ?? 0) + time) - 0.5) * operator.amplitude,
    )
    const band = boundedCell(displaced, count)
    const local = localCell(displaced, band, count)
    return hardSample(band, operator.axis === 'x' ? local : stageX, operator.axis === 'y' ? local : stageY)
  }

  const coordinate = operator.axis === 'x' ? stageX : stageY
  const signed = coordinate - clamp01(operator.position)
  const mix = operator.feather <= 0 ? Number(signed >= 0) : clamp01(0.5 + signed / operator.feather)
  return {
    region: mix >= 0.5 ? 1 : 0,
    localX: stageX,
    localY: stageY,
    mix,
    boundary: Math.abs(signed),
  }
}

function hardSample(region: number, localX: number, localY: number): ShowSpatialSample {
  return {
    region,
    localX,
    localY,
    mix: region % 2,
    boundary: Math.min(localX, 1 - localX, localY, 1 - localY),
  }
}

function boundedCell(coordinate: number, count: number): number {
  return Math.min(count - 1, Math.floor(clamp01(coordinate) * count))
}

function localCell(coordinate: number, cell: number, count: number): number {
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
  if (!Number.isInteger(value) || value < 1) throw new Error('Spatial operator dimensions must be positive integers.')
  return value
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
