// Shared cylinder-wall pi-cell geometry — pure, no DOM/React.
//
// The 1D Pole shape (`shapes.ts`) and the 2D Cylinder surface (`surfaces.ts`)
// both wrap a `cols×rows` grid around a tube and both want each surface cell to
// stay SQUARE. That pins one relationship: the horizontal arc pitch between
// adjacent columns (circumference/cols = 2π·rho/cols) is set equal to the
// vertical pitch between rows (height/(rows-1), height normalized to 1), giving
//
//   rho = cols / (2π(rows-1))     (radius, height units)
//   diameter = 2·rho = cols / (π(rows-1))
//
// Both modules consume these helpers so the math lives in exactly one place
// (the Pole previously carried an inverted copy). A single-row grid degenerates
// to a ring with no wall, so the radius is undefined — callers pick their own
// fallback (the Cylinder centres at 0.5, the Pole at 0.25).

const TAU = Math.PI * 2

// The square-cell wall radius for a `cols×rows` grid, in height units (height
// normalized to 1), or `null` for a degenerate single-row ring (no wall).
export function cylinderWallRadius(cols: number, rows: number): number | null {
  return rows > 1 ? cols / (TAU * (rows - 1)) : null
}

// The wall diameter (2·rho) for a `cols×rows` grid. A single-row ring has no
// meaningful diameter, reported as Infinity.
export function cylinderWallDiameter(cols: number, rows: number): number {
  const rho = cylinderWallRadius(cols, rows)
  return rho === null ? Infinity : 2 * rho
}
