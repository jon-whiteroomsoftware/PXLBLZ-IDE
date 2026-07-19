// Pattern: Test Pattern 3D
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
//
// RGB coordinate channels and a sweeping plane reveal three-dimensional axis orientation.
// Runs on: 3D maps; designed for volumes and shells.
// Controls: None.

export var t

export function beforeRender(delta) {
  t = time(0.1)
}

export function render3D(index, x, y, z) {
  var sweep = clamp(1 - abs(z - t) * 8, 0, 1)
  rgb(max(x, sweep), max(y, sweep), max(z, sweep))
}
