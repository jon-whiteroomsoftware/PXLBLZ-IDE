export const NEW_PATTERN_SRC = `export var t

export function beforeRender(delta) {
  t = time(0.06)
}

export function render2D(index, x, y) {
  hsv(x + t, 1, 1)
}
`
